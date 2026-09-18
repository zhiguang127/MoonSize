///|
fn section_label(id : Int) -> String {
  match id {
    0 => "custom"
    1 => "type"
    2 => "import"
    3 => "function"
    4 => "table"
    5 => "memory"
    6 => "global"
    7 => "export"
    8 => "start"
    9 => "element"
    10 => "code"
    11 => "data"
    12 => "data_count"
    13 => "tag"
    _ => "unknown_\{id}"
  }
}

///|
fn import_counts(r : Reader) -> (Int, Int, Int) raise ParseError {
  let count = r.count()
  r.budget.entries(count, r.pos)
  let mut functions = 0
  let mut tables = 0
  let mut globals = 0
  for i = 0; i < count; i = i + 1 {
    ignore(r.string())
    ignore(r.string())
    match r.byte() {
      0 => {
        ignore(r.u32())
        functions += 1
      }
      1 => {
        tables += 1
        r.value_type()
        r.limits()
      }
      2 => r.limits()
      3 => {
        globals += 1
        r.value_type()
        ignore(r.byte())
      }
      4 => {
        ignore(r.byte())
        ignore(r.u32())
      }
      _ => raise Invalid(r.pos - 1, "Unsupported import descriptor")
    }
  }
  r.finish()
  (functions, tables, globals)
}

///|
fn read_function_names(r : Reader) -> Map[Int, String] raise ParseError {
  let names : Map[Int, String] = Map([])
  while r.pos < r.end {
    r.budget.entries(1, r.pos)
    let kind = r.byte()
    let size = r.bounded_int()
    let sub = r.span(size)
    if kind == 1 {
      let count = sub.count()
      r.budget.entries(count, sub.pos)
      for i = 0; i < count; i = i + 1 {
        let index = sub.bounded_int()
        let name = sub.string()
        if names.contains(index) {
          raise Invalid(sub.pos, "Duplicate function name index")
        }
        names[index] = name
      }
      sub.finish()
    }
  }
  names
}

///|
/// Inspect a core Wasm module without executing it. Reference decoding is
/// optional evidence and failures do not invalidate exact byte accounting.
/// This checks byte framing, not full WebAssembly semantic validity.
pub fn analyze(data : Bytes) -> Analysis raise ParseError {
  if data.length() > max_input_bytes {
    raise ResourceLimit(0, "File exceeds limit \{max_input_bytes} bytes")
  }
  if data.length() < 8 {
    raise Invalid(0, "Expected an 8-byte WebAssembly module header")
  }
  if data[0:4] != b"\x00asm" {
    raise Invalid(0, "Invalid WebAssembly magic")
  }
  if data[4:8] != b"\x01\x00\x00\x00" {
    raise Invalid(
      4, "Only core WebAssembly binary version 1 is supported (not components)",
    )
  }
  let r : Reader = {
    data,
    pos: 8,
    end: data.length(),
    budget: { names_bytes: 0, metadata_entries: 0, reference_entries: 0, },
  }
  let sections : Array[Section] = []
  let bodies : Array[FunctionBody] = []
  let warnings : Array[String] = []
  let seen : Map[Int, Bool] = Map([])
  let mut imports : (Int, Int, Int)? = Some((0, 0, 0))
  let mut names : Map[Int, String] = Map([])
  let mut has_names = false
  let mut function_count : Int? = None
  while r.pos < r.end {
    if sections.length() >= max_sections {
      raise ResourceLimit(r.pos, "Section count exceeds limit \{max_sections}")
    }
    let offset = r.pos
    let id = r.byte()
    let size = r.bounded_int()
    let payload_start = r.pos
    let payload = r.span(size)
    if id != 0 {
      if seen.contains(id) {
        raise Invalid(offset, "Duplicate non-custom section")
      }
      seen[id] = true
    }
    let custom_name = if id == 0 { Some(payload.string()) } else { None }
    sections.push({
      id,
      label: section_label(id),
      custom_name,
      offset,
      header_bytes: payload_start - offset,
      payload_bytes: size,
      total_bytes: r.pos - offset,
    })
    if id == 2 {
      imports = Some(import_counts(payload)) catch {
        ResourceLimit(at, message) => raise ResourceLimit(at, message)
        Invalid(at, message) => {
          warnings.push(
            "Import metadata unavailable at byte \{at}: \{message}; function indices and names omitted",
          )
          None
        }
      }
    } else if id == 3 {
      let count = payload.count()
      if count > max_functions {
        raise ResourceLimit(
          payload.pos,
          "Function count exceeds limit \{max_functions}",
        )
      }
      for i = 0; i < count; i = i + 1 {
        ignore(payload.u32())
      }
      payload.finish()
      function_count = Some(count)
    } else if id == 10 {
      let count = payload.count()
      if count > max_functions {
        raise ResourceLimit(
          payload.pos,
          "Function count exceeds limit \{max_functions}",
        )
      }
      for ordinal = 0; ordinal < count; ordinal = ordinal + 1 {
        let offset = payload.pos
        let body_size = payload.bounded_int()
        let body_start = payload.pos
        ignore(payload.span(body_size))
        if body_size < 2 {
          raise Invalid(
            body_start, "Function body is too short for locals and end",
          )
        }
        bodies.push({
          ordinal,
          function_index: None,
          name: None,
          symbol: None,
          offset,
          body_bytes: body_size,
          prefix_bytes: body_start - offset,
          total_bytes: payload.pos - offset,
        })
      }
      payload.finish()
    } else if custom_name == Some("name") {
      if has_names {
        warnings.push(
          "Multiple name sections: function names omitted as ambiguous",
        )
        names = Map([])
      } else {
        names = read_function_names(payload) catch {
          ResourceLimit(at, message) => raise ResourceLimit(at, message)
          Invalid(at, message) => {
            warnings.push("Name metadata unavailable at byte \{at}: \{message}")
            Map([])
          }
        }
      }
      has_names = true
    } else if id > 13 {
      warnings.push(
        "Unknown section ID \{id} at byte \{offset}; its bytes are counted without interpretation",
      )
    }
  }
  let declared = function_count.unwrap_or(0)
  if declared != bodies.length() {
    raise Invalid(8, "Function and code section counts disagree")
  }
  let functions = bodies.map(fn(body) {
    let index = imports.map(fn(counts) { counts.0 + body.ordinal })
    let name = match index {
      Some(i) => names.get(i)
      None => None
    }
    let symbol = name.map(decode_symbol)
    { ..body, function_index: index, name, symbol, }
  })
  {
    schema_version: 3,
    total_bytes: data.length(),
    module_header_bytes: 8,
    sections,
    functions,
    references: build_references(
      data,
      sections,
      functions,
      imports,
      names,
      r.budget,
    ),
    warnings,
  }
}
