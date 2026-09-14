///|
test "decode compiler captured functions, methods and closure suffixes" {
  let f = decode_symbol("_M0FPB20int__to__string__dec")
  assert_eq(f.display, "@moonbitlang/core/builtin.int_to_string_dec")
  assert_eq(f.package_name, Some("moonbitlang/core/builtin"))
  assert_eq(f.status, "decoded")
  let m = decode_symbol("_M0MPC16string10StringView5splitC895l1703")
  assert_eq(m.display, "@moonbitlang/core/string.StringView::split.anon(l1703)")
  assert_eq(m.kind, "method")
  assert_eq(m.package_name, Some("moonbitlang/core/string"))
}

///|
test "trait implementations do not invent a source package" {
  let s = decode_symbol("_M0IPB13StringBuilderPB6Logger11write__char")
  assert_eq(
    s.display,
    "impl @moonbitlang/core/builtin.Logger for @moonbitlang/core/builtin.StringBuilder with write_char",
  )
  assert_eq(s.package_name, None)
  assert_eq(s.status, "decoded")
}

///|
test "generic symbols preserve type arguments and effects" {
  assert_eq(
    decode_symbol("_M0FPB3mapGisE").display,
    "@moonbitlang/core/builtin.map[Int, String]",
  )
  assert_eq(
    decode_symbol("_M0FPB3mapGAOiEHs").display,
    "@moonbitlang/core/builtin.map[FixedArray[Option[Int]]] raise String",
  )
  assert_eq(
    decode_symbol("_M0FPB3mapGWisEbE").display,
    "@moonbitlang/core/builtin.map[(Int, String) -> Bool]",
  )
}

///|
test "encoded Unicode and literal underscore names" {
  assert_eq(decode_symbol("_M0FP09_e4_bd_a0").display, "@你")
  assert_eq(decode_symbol("_M0FP04a__b").display, "@a_b")
  assert_eq(decode_symbol("$_M0FP04main").display, "@main")
}

///|
test "malformed and future symbols retain raw spelling" {
  for
    raw in [
      "_M1FPB3foo", "_M0FPB99999x", "_M0FPB5abc", "_M0FPB3fooG", "_M0FPB3foo.trailing",
      "_M0FPB3_xx", "_M0",
    ] {
    let s = decode_symbol(raw)
    assert_eq(s.display, raw)
    assert_eq(s.status, "unsupported")
    assert_eq(s.package_name, None)
  }
  let runtime = decode_symbol("moonbit.gc.free")
  assert_eq(runtime.status, "plain")
  assert_eq(runtime.package_name, None)
}

///|
test "deep generic nesting is bounded" {
  let b = StringBuilder()
  b.write_string("_M0FPB3fooG")
  for i = 0; i < 80; i = i + 1 {
    b.write_string("O")
  }
  b.write_string("iE")
  let raw = b.to_string()
  assert_eq(decode_symbol(raw).status, "unsupported")
}

///|
test "nested functions and locals keep useful readable identity" {
  assert_eq(decode_symbol("_M0FP04mainN5innerS123").display, "@main.inner")
  assert_eq(decode_symbol("_M0L4tempS42").display, "@temp")
  assert_eq(decode_symbol("_M0FP04main").package_name, None)
}

///|
test "resource limits reject excessive sections and preserve boundary" {
  let parts : Array[Bytes] = []
  for i = 0; i < max_sections; i = i + 1 {
    parts.push(custom("", b""))
  }
  assert_eq(analyze(module_bytes(parts)).sections.length(), max_sections)
  parts.push(custom("", b""))
  let limited = try {
    ignore(analyze(module_bytes(parts)))
    false
  } catch {
    ResourceLimit(_, _) => true
    _ => false
  }
  assert_true(limited)
}

///|
test "function count ceiling prevents metadata allocation" {
  let data = module_bytes([
    sec(
      3,
      join_bytes([leb(max_functions + 1), Bytes::make(max_functions + 1, 0)]),
    ),
  ])
  let limited = try {
    ignore(analyze(data))
    false
  } catch {
    ResourceLimit(_, _) => true
    _ => false
  }
  assert_true(limited)
}

///|
test "per name limits propagate through optional metadata parsing" {
  let long = @utf8.decode(Bytes::make(max_name_bytes + 1, 97)[:])
  let data = sample([
    custom("name", sec(1, join_bytes([b"\x01\x00", named(long)]))),
  ])
  let limited = try {
    ignore(analyze(data))
    false
  } catch {
    ResourceLimit(_, _) => true
    _ => false
  }
  assert_true(limited)
}

///|
test "total name bytes have a shared module budget" {
  let name = @utf8.decode(Bytes::make(max_name_bytes, 97)[:])
  let parts : Array[Bytes] = []
  for i = 0; i <= max_total_name_bytes / max_name_bytes; i = i + 1 {
    parts.push(custom(name, b""))
  }
  let limited = try {
    ignore(analyze(module_bytes(parts)))
    false
  } catch {
    ResourceLimit(_, _) => true
    _ => false
  }
  assert_true(limited)
}

///|
test "import entry budget is enforced before iterating descriptors" {
  let count = max_metadata_entries + 1
  let data = module_bytes([
    sec(2, join_bytes([leb(count), Bytes::make(count * 4, 0)])),
  ])
  let limited = try {
    ignore(analyze(data))
    false
  } catch {
    ResourceLimit(_, _) => true
    _ => false
  }
  assert_true(limited)
}

///|
test "unknown name subsections still consume the metadata budget" {
  let parts : Array[Bytes] = []
  for i = 0; i <= max_metadata_entries; i = i + 1 {
    parts.push(b"\x02\x00")
  }
  let data = module_bytes([custom("name", join_bytes(parts))])
  let limited = try {
    ignore(analyze(data))
    false
  } catch {
    ResourceLimit(_, _) => true
    _ => false
  }
  assert_true(limited)
}
