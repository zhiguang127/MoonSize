///|
test "L3 direct calls, recursion, ref.func and shortest root path" {
  let a = analyze(
    attributed_module(
      [
        (Some("entry"), b"\x10\x01"),
        (Some("middle"), b"\x10\x02"),
        (Some("leaf"), b"\x10\x01\xd2\x02\x1a"),
      ],
      extra=[sec(7, b"\x01\x03run\x00\x00")],
    ),
  )
  let g = a.references
  assert_eq(g.status, "decoded")
  assert_eq(g.edges.length(), 4)
  assert_eq(g.nodes[1].incoming.length(), 2)
  assert_eq(g.nodes[2].outgoing.length(), 2)
  let path = inclusion_path(g, 2)
  assert_eq(path.root.unwrap().name, "run")
  assert_eq(path.edges.length(), 2)
  assert_eq(path.edges[0].source_index, 0)
  assert_eq(path.edges[1].target, 2)
}

///|
test "L3 imported function offsets and start roots" {
  let a = analyze(
    module_bytes([
      sec(1, b"\x01\x60\x00\x00"),
      sec(2, b"\x01\x01m\x01f\x00\x00"),
      sec(3, b"\x01\x00"),
      sec(8, b"\x01"),
      sec(10, b"\x01\x04\x00\x10\x00\x0b"),
    ]),
  )
  assert_eq(a.references.nodes[0].scan_status, "imported")
  assert_eq(a.references.edges[0].source_index, 1)
  assert_eq(inclusion_path(a.references, 0).root.unwrap().kind, "start")
}

///|
test "L3 immediate bytes never produce phantom calls" {
  let a = analyze(
    attributed_module([
      (
        None,
        b"\x41\x10\x1a\x43\x10\x00\xd2\x00\x1a\xfd\x0c\x10\x00\x10\x00\x10\x00\x10\x00\x10\x00\x10\x00\x10\x00\x10\x00\x1a",
      ),
    ]),
  )
  assert_eq(a.references.decoded_functions, 1)
  assert_eq(a.references.edges.length(), 0)
}

///|
test "L3 indirect and typed calls remain dynamic, never invented direct edges" {
  let a = analyze(
    attributed_module([(None, b"\x11\x00\x00\x14\x00\x13\x00\x00\x15\x00")]),
  )
  assert_eq(a.references.status, "partial")
  assert_eq(a.references.decoded_functions, 1)
  assert_eq(a.references.dynamic_references.length(), 4)
  assert_eq(a.references.dynamic_references[0].table_index, Some(0))
  assert_eq(a.references.edges.length(), 0)
  assert_eq(inclusion_path(a.references, 0).status, "no_known_path")
}

///|
test "L3 GC immediate framing preserves following calls" {
  let a = analyze(
    attributed_module([
      (
        None,
        b"\xfb\x00\x10\x1a\xfb\x02\x10\x10\x1a\xfb\x08\x10\x10\x1a\xfb\x14\x70\x1a\x10\x00",
      ),
    ]),
  )
  assert_eq(a.references.decoded_functions, 1)
  assert_eq(a.references.edges.length(), 1)
  assert_eq(a.references.edges[0].target, 0)
}

///|
test "L3 unknown instructions, bad immediates and out of range calls degrade only references" {
  for
    body in [
      b"\x10\x00\xff\x10\x00", b"\x10\x80", b"\x10\x01", b"\xfb\x7f", b"\xfd\x9a\x01",
    ] {
    let input = attributed_module([(None, body)])
    let a = analyze(input)
    assert_eq(a.total_bytes, input.length())
    assert_eq(a.references.status, "partial")
    assert_eq(a.references.edges.length(), 0)
    assert_eq(a.references.issues.length(), 1)
  }
}

///|
test "L3 all eight element encodings retain mode and table, not direct calls" {
  let segments = [
    b"\x00\x41\x00\x0b\x01\x00", b"\x01\x00\x01\x00", b"\x02\x01\x41\x00\x0b\x00\x01\x00",
    b"\x03\x00\x01\x00", b"\x04\x41\x00\x0b\x01\xd2\x00\x0b", b"\x05\x70\x01\xd2\x00\x0b",
    b"\x06\x01\x41\x00\x0b\x70\x01\xd2\x00\x0b", b"\x07\x70\x01\xd2\x00\x0b",
  ]
  let a = analyze(
    attributed_module([(None, b"")], extra=[
      sec(9, join_bytes([b"\x08", ..segments])),
    ]),
  )
  assert_eq(a.references.issues.length(), 0)
  assert_eq(a.references.edges.length(), 8)
  assert_eq(a.references.edges[0].table_index, Some(0))
  assert_eq(a.references.edges[2].table_index, Some(1))
  assert_eq(a.references.edges[1].source_kind, "element_passive")
  assert_eq(a.references.edges[3].source_kind, "element_declarative")
  assert_eq(a.references.nodes[0].outgoing.length(), 0)
}

///|
test "L3 global and table initializers expose reference roots" {
  let a = analyze(
    attributed_module([(None, b"")], extra=[
      sec(4, b"\x01\x40\x00\x70\x00\x01\xd2\x00\x0b"),
      sec(6, b"\x01\x70\x00\xd2\x00\x0b"),
    ]),
  )
  assert_eq(a.references.issues.length(), 0)
  assert_eq(a.references.edges.length(), 2)
  assert_eq(a.references.edges[0].source_kind, "table")
  assert_eq(a.references.edges[1].source_kind, "global")
}

///|
test "L3 exported entry paths take priority over element declarations" {
  let a = analyze(
    attributed_module([(None, b"\x10\x01"), (None, b"")], extra=[
      sec(7, b"\x01\x03run\x00\x00"),
      sec(9, b"\x01\x03\x00\x01\x01"),
    ]),
  )
  assert_eq(inclusion_path(a.references, 1).root.unwrap().kind, "export")
  assert_eq(inclusion_path(a.references, 1).edges.length(), 1)
}

///|
test "L3 cyclic unrooted functions remain no known path" {
  let a = analyze(attributed_module([(None, b"\x10\x01"), (None, b"\x10\x00")]))
  assert_eq(inclusion_path(a.references, 1).status, "no_known_path")
  assert_eq(inclusion_path(a.references, 2).status, "unavailable")
}

///|
test "L3 reference budget produces resource error rather than optional warning" {
  let instructions = join_bytes(
    Array::make(max_reference_entries + 1, b"\x10\x00"),
  )
  let input = attributed_module([(None, instructions)])
  let limited = try {
    ignore(analyze(input))
    false
  } catch {
    ResourceLimit(_, _) => true
    _ => false
  }
  assert_true(limited)
}

///|
test "L3 control nesting limit is a resource error without recursion" {
  let body = join_bytes([
    join_bytes(Array::make(max_control_depth, b"\x02\x40")),
    Bytes::make(max_control_depth, 0x0b),
  ])
  let limited = try {
    ignore(analyze(attributed_module([(None, body)])))
    false
  } catch {
    ResourceLimit(_, _) => true
    _ => false
  }
  assert_true(limited)
}

///|
test "L3 malformed framing cannot leak references from an incomplete section" {
  let a = analyze(
    attributed_module([(None, b"")], extra=[
      sec(7, b"\x02\x03run\x00\x00\x04bad"),
    ]),
  )
  assert_eq(a.references.status, "partial")
  assert_eq(a.references.roots.length(), 0)
  assert_eq(a.references.issues[0].source_kind, "export")
}

///|
test "L3 unknown import index space makes graph explicitly unavailable" {
  let a = analyze(
    module_bytes([
      sec(2, b"\x01\x00\x00\xff"),
      sec(3, b"\x01\x00"),
      sec(10, b"\x01\x04\x00\x10\x00\x0b"),
    ]),
  )
  assert_eq(a.references.status, "unavailable")
  assert_eq(a.references.nodes.length(), 0)
  assert_eq(a.references.edges.length(), 0)
}
