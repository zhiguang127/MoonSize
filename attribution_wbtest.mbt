///|
fn attributed_module(
  entries : Array[(String?, Bytes)],
  extra? : Array[Bytes] = [],
) -> Bytes {
  let bodies : Array[Bytes] = [leb(entries.length())]
  let names : Array[Bytes] = []
  let mut n = 0
  for i = 0; i < entries.length(); i = i + 1 {
    let (name, instructions) = entries[i]
    let body = join_bytes([b"\x00", instructions, b"\x0b"])
    bodies.push(join_bytes([leb(body.length()), body]))
    if name is Some(text) {
      names.push(join_bytes([leb(i), named(text)]))
      n += 1
    }
  }
  module_bytes(
    [
      sec(1, b"\x01\x60\x00\x00"),
      sec(
        3,
        join_bytes([leb(entries.length()), Bytes::make(entries.length(), 0)]),
      ),
      ..extra,
      sec(10, join_bytes(bodies)),
      custom("name", sec(1, join_bytes([leb(n), ..names]))),
    ],
  )
}

///|
test "L2 matches unique raw symbols across reordered indices with byte coverage" {
  let a = analyze(
    attributed_module([(Some("alpha"), b""), (Some("beta"), b"\x01")]),
  )
  let b = analyze(
    attributed_module([(Some("beta"), b""), (Some("alpha"), b"\x01\x01")]),
  )
  let d = compare(a, b)
  assert_eq(d.matching.exact_matches, 2)
  assert_eq(d.functions[0].after.unwrap().function_index, Some(1))
  assert_eq(d.functions[0].change, "grown")
  assert_eq(d.functions[0].delta_bytes, Some(2))
  assert_eq(d.functions[1].change, "shrunk")
  assert_eq(d.matching.before.matched_bytes, 7)
  assert_eq(d.matching.after.matched_bytes, 8)
  assert_eq(d.code_overhead_delta_bytes, 0)
}

///|
test "L2 refuses duplicate and missing names and reports one-sided symbols" {
  let a = analyze(
    attributed_module([
      (Some("dup"), b""),
      (Some("dup"), b""),
      (None, b""),
      (Some("old"), b""),
    ]),
  )
  let b = analyze(
    attributed_module([(Some("dup"), b""), (Some("new"), b""), (Some(""), b"")]),
  )
  let d = compare(a, b)
  assert_eq(d.matching.exact_matches, 0)
  assert_eq(d.matching.before.ambiguous_name, 2)
  assert_eq(d.matching.after.ambiguous_name, 1)
  assert_eq(d.matching.before.missing_name, 1)
  assert_eq(d.matching.after.missing_name, 1)
  assert_eq(d.functions[0].delta_bytes, None)
  assert_eq(d.functions[3].change, "removed_symbol")
  assert_eq(d.functions[5].change, "added_symbol")
  assert_eq(d.functions[6].reason, "missing_name")
}

///|
test "L2 raw matching does not require decoding and same size is not same behavior" {
  let a = analyze(attributed_module([(Some("_M9future"), b"\x01")]))
  let b = analyze(attributed_module([(Some("_M9future"), b"\x00")]))
  let d = compare(a, b)
  assert_eq(d.functions[0].match_kind, "matched_exact")
  assert_eq(d.functions[0].change, "same_size")
}

///|
test "L2 package sums include unknowns and separate code framing" {
  let a = analyze(
    attributed_module([(Some("_M0FPB3foo"), b""), (None, b"\x01")]),
  )
  let b = analyze(
    attributed_module([(Some("_M0FPB3foo"), b"\x01"), (Some("_M0FPB3bar"), b"")]),
  )
  let d = compare(a, b)
  assert_eq(d.packages[0].package_name, Some("moonbitlang/core/builtin"))
  assert_eq(d.packages[0].delta_bytes, 4)
  assert_eq(d.packages[1].package_name, None)
  assert_eq(d.packages[1].delta_bytes, -4)
  assert_eq(
    d.packages.fold(init=0, fn(n, p) { n + p.before_bytes }),
    d.matching.before.total_bytes,
  )
  assert_eq(
    d.packages.fold(init=0, fn(n, p) { n + p.after_bytes }),
    d.matching.after.total_bytes,
  )
  let empty = analyze(module_bytes([]))
  assert_eq(compare(empty, a).code_overhead_delta_bytes, 3)
}
