///|
fn join_bytes(parts : Array[Bytes]) -> Bytes {
  let result : Array[Byte] = []
  for part in parts {
    for b in part {
      result.push(b)
    }
  }
  Bytes::from_array(result)
}

///|
fn leb(value : Int) -> Bytes {
  let bytes : Array[Byte] = []
  let mut n = value
  while n >= 128 {
    bytes.push(((n & 127) | 128).to_byte())
    n = n >> 7
  }
  bytes.push(n.to_byte())
  Bytes::from_array(bytes)
}

///|
fn sec(id : Int, payload : Bytes) -> Bytes {
  join_bytes([Bytes::from_array([id.to_byte()]), leb(payload.length()), payload])
}

///|
fn module_bytes(sections : Array[Bytes]) -> Bytes {
  join_bytes([b"\x00asm\x01\x00\x00\x00", ..sections])
}

///|
fn named(value : String) -> Bytes {
  let bytes = @utf8.encode(value)
  join_bytes([leb(bytes.length()), bytes])
}

///|
fn custom(name : String, payload : Bytes) -> Bytes {
  sec(0, join_bytes([named(name), payload]))
}

///|
fn sample(extra : Array[Bytes]) -> Bytes {
  module_bytes(
    [
      sec(1, b"\x01\x60\x00\x00"),
      sec(3, b"\x01\x00"),
      sec(10, b"\x01\x02\x00\x0b"),
      ..extra,
    ],
  )
}

///|
fn invalid(bytes : Bytes) -> Bool {
  try {
    ignore(analyze(bytes))
    false
  } catch {
    _ => true
  }
}

///|
test "empty module has exactly eight accounted bytes" {
  let result = analyze(module_bytes([]))
  assert_eq(result.total_bytes, 8)
  assert_eq(result.module_header_bytes, 8)
  assert_eq(result.sections.length(), 0)
}

///|
test "code body breakdown is contained in section total" {
  let result = analyze(sample([]))
  assert_eq(result.total_bytes, 24)
  assert_eq(result.sections[2].total_bytes, 6)
  assert_eq(result.functions[0].body_bytes, 2)
  assert_eq(result.functions[0].prefix_bytes, 1)
  assert_eq(result.functions[0].offset, 21)
  assert_eq(result.functions[0].function_index, Some(0))
}

///|
test "truncated header, magic and component version rejected" {
  assert_true(invalid(b""))
  assert_true(invalid(b"\x00asm\x01"))
  assert_true(invalid(b"BAD!\x01\x00\x00\x00"))
  assert_true(invalid(b"\x00asm\x0d\x00\x01\x00"))
}

///|
test "declared section length cannot escape file" {
  assert_true(invalid(module_bytes([b"\x01\x06\x00"])))
  assert_true(invalid(module_bytes([b"\x01\x80"])))
}

///|
test "oversized and overflowing LEB lengths fail without allocation" {
  assert_true(invalid(module_bytes([b"\x01\xff\xff\xff\xff\x0f"])))
  assert_true(invalid(module_bytes([b"\x01\x80\x80\x80\x80\x10"])))
  assert_true(invalid(module_bytes([b"\x01\x80\x80\x80\x80\x80\x00"])))
}

///|
test "valid non-minimal LEB length contributes actual header bytes" {
  let a = analyze(module_bytes([b"\x00\x81\x00\x00"]))
  assert_eq(a.sections[0].header_bytes, 3)
  assert_eq(a.total_bytes, 12)
}

///|
test "UTF8 names retain non ASCII and BOM and reject malformed encoding" {
  let a = analyze(
    module_bytes([custom("体积", b"x"), custom("\uFEFFname", b"")]),
  )
  assert_eq(a.sections[0].custom_name, Some("体积"))
  assert_eq(a.sections[1].custom_name, Some("\uFEFFname"))
  assert_true(invalid(module_bytes([sec(0, b"\x01\xff")])))
}

///|
test "function and code counts must agree" {
  assert_true(invalid(module_bytes([sec(3, b"\x01\x00")])))
  assert_true(invalid(module_bytes([sec(10, b"\x01\x02\x00\x0b")])))
}

///|
test "code body lengths cannot consume another section" {
  assert_true(
    invalid(
      module_bytes([
        sec(3, b"\x01\x00"),
        sec(10, b"\x01\x06\x00\x0b"),
        custom("x", b"123456"),
      ]),
    ),
  )
  assert_true(
    invalid(module_bytes([sec(3, b"\x01\x00"), sec(10, b"\x01\x00")])),
  )
}

///|
test "duplicate standard sections and trailing code bytes rejected" {
  assert_true(invalid(module_bytes([sec(1, b"\x00"), sec(1, b"\x00")])))
  assert_true(invalid(module_bytes([sec(10, b"\x00\x01")])))
}

///|
test "function names account for imported functions" {
  let names = custom(
    "name",
    sec(1, join_bytes([b"\x02\x00", named("imported"), b"\x01", named("main")])),
  )
  let a = analyze(
    module_bytes([
      sec(1, b"\x01\x60\x00\x00"),
      sec(2, b"\x01\x01m\x01f\x00\x00"),
      sec(3, b"\x01\x00"),
      sec(10, b"\x01\x02\x00\x0b"),
      names,
    ]),
  )
  assert_eq(a.functions[0].function_index, Some(1))
  assert_eq(a.functions[0].name, Some("main"))
}

///|
test "unreadable import metadata never invents function indices" {
  let a = analyze(
    module_bytes([
      sec(2, b"\x01\x00\x00\xff"),
      sec(3, b"\x01\x00"),
      sec(10, b"\x01\x02\x00\x0b"),
    ]),
  )
  assert_eq(a.functions[0].function_index, None)
  assert_eq(a.functions[0].name, None)
  assert_eq(a.warnings.length(), 1)
}

///|
test "non function imports do not shift function indices" {
  let a = analyze(
    module_bytes([
      sec(
        2, b"\x04\x00\x00\x01\x70\x00\x00\x00\x00\x02\x00\x01\x00\x00\x03\x7f\x00\x00\x00\x04\x00\x00",
      ),
      sec(3, b"\x01\x00"),
      sec(10, b"\x01\x02\x00\x0b"),
    ]),
  )
  assert_eq(a.functions[0].function_index, Some(0))
  assert_eq(a.warnings.length(), 0)
}

///|
test "damaged optional names produce warnings but preserve accounting" {
  let input = sample([custom("name", b"\x01\x05\x01")])
  let a = analyze(input)
  assert_eq(a.total_bytes, input.length())
  assert_eq(a.functions[0].name, None)
  assert_eq(a.warnings.length(), 1)
}

///|
test "duplicate name sections are ambiguous even if names agree" {
  let name = custom("name", sec(1, join_bytes([b"\x01\x00", named("main")])))
  let a = analyze(sample([name, name, name]))
  assert_eq(a.functions[0].name, None)
  assert_eq(a.warnings.length(), 2)
}

///|
test "unknown sections are preserved with an explicit warning" {
  let a = analyze(module_bytes([sec(42, b"abc")]))
  assert_eq(a.sections[0].total_bytes, 5)
  assert_eq(a.warnings.length(), 1)
}

///|
test "generated payload lengths account for every byte at LEB boundaries" {
  for size in [0, 1, 126, 127, 128, 129, 16382, 16383, 16384] {
    let input = module_bytes([custom("data", Bytes::make(size, 0))])
    let a = analyze(input)
    let mut counted = a.module_header_bytes
    for s in a.sections {
      counted += s.total_bytes
    }
    assert_eq(counted, input.length())
    assert_eq(a.sections[0].offset + a.sections[0].total_bytes, input.length())
  }
}

///|
test "all truncations inside a custom section fail safely" {
  let input = module_bytes([custom("payload", Bytes::make(260, 0))])
  for size = 9; size < input.length(); size = size + 1 {
    assert_true(invalid(input[0:size].to_owned()))
  }
}

///|
test "diff aggregates repeated custom names without conflating standard labels" {
  let a = analyze(sample([custom("code", b"a"), custom("code", b"bc")]))
  let b = analyze(sample([custom("code", b"abcd"), custom("new", b"x")]))
  let d = compare(a, b)
  assert_eq(d.sections.length(), 5)
  assert_eq(d.sections[2].id, 10)
  assert_eq(d.sections[3].custom_name, Some("code"))
  assert_eq(d.sections[3].delta_bytes, -6)
  let mut sum = 0
  for s in d.sections {
    sum += s.delta_bytes
  }
  assert_eq(sum, d.delta_bytes)
}

///|
test "removed and added sections preserve signed delta" {
  let a = analyze(module_bytes([custom("old", b"12345")]))
  let b = analyze(module_bytes([custom("new", b"x")]))
  let d = compare(a, b)
  assert_eq(d.delta_bytes, -4)
  assert_eq(d.sections[0].after_bytes, 0)
  assert_eq(d.sections[1].before_bytes, 0)
}

///|
test "budgets are inclusive and report both failures" {
  let d = compare(analyze(module_bytes([])), analyze(sample([])))
  assert_true(check_budget(d, max_bytes=24, max_growth_bytes=16).passed)
  let failed = check_budget(d, max_bytes=23, max_growth_bytes=15)
  assert_true(!failed.passed)
  assert_eq(failed.violations.length(), 2)
}

///|
test "shrinking files pass zero growth and negative limits are invalid" {
  let d = compare(analyze(sample([])), analyze(module_bytes([])))
  assert_true(check_budget(d, max_growth_bytes=0).passed)
  let rejected = try {
    ignore(check_budget(d, max_bytes=-1))
    false
  } catch {
    _ => true
  }
  assert_true(rejected)
}
