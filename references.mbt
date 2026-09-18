///|
/// A syntactic reference at a byte offset. It does not prove execution.
pub(all) struct ReferenceEdge {
  source_kind : String
  source_index : Int
  target : Int
  kind : String
  offset : Int
  table_index : Int?
} derive(Debug)

///|
pub(all) struct ReferenceRoot {
  kind : String
  name : String
  function_index : Int
  offset : Int
} derive(ToJson, Debug)

///|
pub(all) struct DynamicReference {
  source_kind : String
  source_index : Int
  kind : String
  offset : Int
  table_index : Int?
  type_index : Int?
} derive(Debug)

///|
pub(all) struct ReferenceIssue {
  source_kind : String
  source_index : Int
  offset : Int
  message : String
} derive(ToJson, Debug)

///|
/// Edge IDs and a BFS predecessor forest keep storage linear, even for chains.
pub(all) struct ReferenceNode {
  function_index : Int
  name : String?
  scan_status : String
  incoming : Array[Int]
  outgoing : Array[Int]
  root_index : Int?
  parent_edge : Int?
} derive(Debug)

///|
pub(all) struct ReferenceGraph {
  status : String
  decoded_functions : Int
  total_functions : Int
  nodes : Array[ReferenceNode]
  edges : Array[ReferenceEdge]
  roots : Array[ReferenceRoot]
  dynamic_references : Array[DynamicReference]
  issues : Array[ReferenceIssue]
} derive(ToJson, Debug)

///|
pub(all) struct InclusionPath {
  status : String
  root : ReferenceRoot?
  edges : Array[ReferenceEdge]
} derive(Debug)

///|
/// A path through known syntactic references. No path never means dead code.
pub fn inclusion_path(
  graph : ReferenceGraph,
  function_index : Int,
) -> InclusionPath {
  if function_index < 0 || function_index >= graph.nodes.length() {
    return { status: "unavailable", root: None, edges: [], }
  }
  let node = graph.nodes[function_index]
  guard node.root_index is Some(root_index) else {
    return { status: "no_known_path", root: None, edges: [], }
  }
  let path : Array[ReferenceEdge] = []
  let mut current = node
  while current.parent_edge is Some(edge_index) {
    let edge = graph.edges[edge_index]
    path.push(edge)
    current = graph.nodes[edge.source_index]
  }
  {
    status: "known_reference_path",
    root: Some(graph.roots[root_index]),
    edges: path.rev(),
  }
}

///|
priv struct ReferenceScan {
  edges : Array[ReferenceEdge]
  roots : Array[ReferenceRoot]
  dynamic : Array[DynamicReference]
  budget : ResourceBudget
  function_count : Int
}

///|
fn ReferenceScan::edge(
  self : ReferenceScan,
  source_kind : String,
  source_index : Int,
  target : Int,
  kind : String,
  offset : Int,
  table_index? : Int,
) -> Unit raise ParseError {
  if target >= self.function_count {
    raise Invalid(offset, "Function reference index out of range")
  }
  self.budget.reference(offset)
  self.edges.push({
    source_kind,
    source_index,
    target,
    kind,
    offset,
    table_index,
  })
  if source_kind != "function" {
    self.budget.reference(offset)
    self.roots.push({
      kind: source_kind,
      name: "\{source_kind}[\{source_index}]",
      function_index: target,
      offset,
    })
  }
}

///|
fn ReferenceScan::dynamic_ref(
  self : ReferenceScan,
  source_kind : String,
  source_index : Int,
  kind : String,
  offset : Int,
  table_index? : Int,
  type_index? : Int,
) -> Unit raise ParseError {
  self.budget.reference(offset)
  self.dynamic.push({
    source_kind,
    source_index,
    kind,
    offset,
    table_index,
    type_index,
  })
}

///|
fn Reader::signed_skip(self : Reader, bits : Int) -> Unit raise ParseError {
  let start = self.pos
  let max = (bits + 6) / 7
  for i = 0; i < max; i = i + 1 {
    let b = self.byte()
    if i == max - 1 {
      let remaining = bits - i * 7
      let bound = 1 << (remaining - 1)
      if !(b < bound || (b >= 128 - bound && b < 128)) {
        raise Invalid(start, "Signed LEB128 exceeds immediate width")
      }
    }
    if b < 128 {
      return
    }
  }
  raise Invalid(start, "Unterminated signed immediate")
}

///|
fn Reader::block_type(self : Reader) -> Unit raise ParseError {
  if self.pos < self.end &&
    (self.data[self.pos] == 0x63 || self.data[self.pos] == 0x64) {
    self.value_type()
  } else {
    self.signed_skip(33)
  }
}

///|
fn Reader::memarg(self : Reader) -> Unit raise ParseError {
  let flags = self.bounded_int()
  if flags >= 128 {
    raise Invalid(self.pos, "Unsupported memory operand flags")
  }
  if (flags & 64) != 0 {
    ignore(self.u32())
  }
  self.u64_skip()
}

///|
/// Iterative framing decoder. Unknown opcodes stop this region, never guess
/// their immediate length. Numeric payload bytes cannot become fake edges.
fn scan_expression(
  r : Reader,
  scan : ReferenceScan,
  source_kind : String,
  source_index : Int,
  table_index? : Int,
) -> Unit raise ParseError {
  let blocks : Array[Int] = [0]
  while r.pos < r.end {
    if blocks.length() > max_control_depth {
      raise ResourceLimit(
        r.pos,
        "Control nesting exceeds limit \{max_control_depth}",
      )
    }
    let at = r.pos
    let op = r.byte()
    match op {
      0x02 | 0x03 | 0x04 => {
        r.block_type()
        blocks.push(op)
      }
      0x05 => {
        if blocks[blocks.length() - 1] != 0x04 {
          raise Invalid(at, "Misplaced else")
        }
        blocks[blocks.length() - 1] = 0x05
      }
      0x0B => {
        ignore(blocks.pop())
        if blocks.is_empty() {
          return
        }
      }
      0x1F => {
        r.block_type()
        let count = r.count()
        for i = 0; i < count; i = i + 1 {
          let kind = r.byte()
          if kind > 3 {
            raise Invalid(at, "Unsupported catch kind")
          }
          if kind < 2 {
            ignore(r.u32())
          }
          ignore(r.u32())
        }
        blocks.push(op)
      }
      0x10 | 0x12 | 0xD2 => {
        let target = r.bounded_int()
        scan.edge(
          source_kind,
          source_index,
          target,
          if op == 0x10 {
            "call"
          } else if op == 0x12 {
            "return_call"
          } else {
            "ref_func"
          },
          at,
          table_index?,
        )
      }
      0x11 | 0x13 => {
        let type_index = r.bounded_int()
        let table_index = r.bounded_int()
        scan.dynamic_ref(
          source_kind,
          source_index,
          if op == 0x11 {
            "call_indirect"
          } else {
            "return_call_indirect"
          },
          at,
          table_index~,
          type_index~,
        )
      }
      0x14 | 0x15 => {
        let type_index = r.bounded_int()
        scan.dynamic_ref(
          source_kind,
          source_index,
          if op == 0x14 {
            "call_ref"
          } else {
            "return_call_ref"
          },
          at,
          type_index~,
        )
      }
      0x08
      | 0x0C
      | 0x0D
      | 0x20
      | 0x21
      | 0x22
      | 0x23
      | 0x24
      | 0x25
      | 0x26
      | 0x3F
      | 0x40
      | 0xD5
      | 0xD6 => ignore(r.u32())
      0x0E => {
        let count = r.count()
        for i = 0; i < count; i = i + 1 {
          ignore(r.u32())
        }
        ignore(r.u32())
      }
      0x1C => {
        let count = r.count()
        for i = 0; i < count; i = i + 1 {
          r.value_type()
        }
      }
      0x41 => r.signed_skip(32)
      0x42 => r.signed_skip(64)
      0x43 => ignore(r.span(4))
      0x44 => ignore(r.span(8))
      0xD0 => r.heap_type()
      0xFB => {
        let sub = r.bounded_int()
        match sub {
          0 | 1 | 6 | 7 | 11 | 12 | 13 | 14 | 16 => ignore(r.u32())
          2 | 3 | 4 | 5 | 8 | 9 | 10 | 17 | 18 | 19 => {
            ignore(r.u32())
            ignore(r.u32())
          }
          20 | 21 | 22 | 23 => r.heap_type()
          24 | 25 => {
            if r.byte() > 3 {
              raise Invalid(at, "Unsupported cast flags")
            }
            ignore(r.u32())
            r.heap_type()
            r.heap_type()
          }
          15 | 26 | 27 | 28 | 29 | 30 => ()
          _ => raise Invalid(at, "Unsupported GC opcode \{sub}")
        }
      }
      0xFC => {
        let sub = r.bounded_int()
        match sub {
          0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 => ()
          8 | 10 | 12 | 14 => {
            ignore(r.u32())
            ignore(r.u32())
          }
          9 | 11 | 13 | 15 | 16 | 17 => ignore(r.u32())
          _ => raise Invalid(at, "Unsupported bulk-memory opcode \{sub}")
        }
      }
      0xFD => {
        let sub = r.bounded_int()
        if sub <= 11 || sub == 92 || sub == 93 {
          r.memarg()
        } else if sub == 12 || sub == 13 {
          ignore(r.span(16))
        } else if sub >= 21 && sub <= 34 {
          ignore(r.byte())
        } else if sub >= 84 && sub <= 91 {
          r.memarg()
          ignore(r.byte())
        } else if (sub >= 14 && sub <= 20) ||
          (sub >= 35 && sub <= 83) ||
          (sub >= 94 && sub <= 153) ||
          sub == 155 ||
          sub == 156 ||
          sub == 157 ||
          sub == 158 ||
          sub == 159 ||
          sub == 160 ||
          sub == 161 ||
          sub == 163 ||
          sub == 164 ||
          (sub >= 167 && sub <= 174) ||
          sub == 177 ||
          (sub >= 181 && sub <= 186) ||
          (sub >= 188 && sub <= 193) ||
          sub == 195 ||
          sub == 196 ||
          (sub >= 199 && sub <= 206) ||
          sub == 209 ||
          (sub >= 213 && sub <= 225) ||
          (sub >= 227 && sub <= 237) ||
          (sub >= 239 && sub <= 275) {
          ()
        } else {
          raise Invalid(at, "Unsupported SIMD opcode \{sub}")
        }
      }
      _ =>
        if op >= 0x28 && op <= 0x3E {
          r.memarg()
        } else if (op >= 0x45 && op <= 0xC4) ||
          op == 0 ||
          op == 1 ||
          op == 0x0A ||
          op == 0x0F ||
          op == 0x1A ||
          op == 0x1B ||
          op == 0xD1 ||
          op == 0xD3 ||
          op == 0xD4 {
          ()
        } else {
          raise Invalid(at, "Unsupported instruction opcode \{op}")
        }
    }
  }
  raise Invalid(r.pos, "Missing expression end")
}

///|
fn scan_reference_section(
  id : Int,
  r : Reader,
  scan : ReferenceScan,
  imported_tables : Int,
  imported_globals : Int,
) -> Unit raise ParseError {
  if id == 8 {
    let at = r.pos
    let index = r.bounded_int()
    if index >= scan.function_count {
      raise Invalid(at, "Start function index out of range")
    }
    scan.budget.reference(at)
    scan.roots.push({
      kind: "start",
      name: "start",
      function_index: index,
      offset: at,
    })
  } else {
    let count = r.count()
    r.budget.entries(count, r.pos)
    for i = 0; i < count; i = i + 1 {
      let at = r.pos
      if id == 7 {
        let name = r.string()
        let kind = r.byte()
        let index = r.bounded_int()
        if kind > 4 {
          raise Invalid(at, "Unsupported export kind")
        }
        if kind == 0 {
          if index >= scan.function_count {
            raise Invalid(at, "Export function index out of range")
          }
          scan.budget.reference(at)
          scan.roots.push({
            kind: "export",
            name,
            function_index: index,
            offset: at,
          })
        }
      } else if id == 6 {
        r.value_type()
        if r.byte() > 1 {
          raise Invalid(at, "Invalid global mutability")
        }
        scan_expression(r, scan, "global", imported_globals + i)
      } else if id == 4 {
        let has_init = r.pos < r.end && r.data[r.pos] == 0x40
        if has_init {
          ignore(r.byte())
          if r.byte() != 0 {
            raise Invalid(at, "Unsupported table initializer")
          }
        }
        r.value_type()
        r.limits()
        if has_init {
          scan_expression(
            r,
            scan,
            "table",
            imported_tables + i,
            table_index=imported_tables + i,
          )
        }
      } else if id == 9 {
        let flags = r.bounded_int()
        if flags > 7 {
          raise Invalid(at, "Unsupported element segment flags")
        }
        let active = flags == 0 || flags == 2 || flags == 4 || flags == 6
        let table = if active {
          Some(if flags == 2 || flags == 6 { r.bounded_int() } else { 0 })
        } else {
          None
        }
        let kind = if active {
          "element_active"
        } else if flags == 1 || flags == 5 {
          "element_passive"
        } else {
          "element_declarative"
        }
        if active {
          scan_expression(r, scan, "element_offset", i, table_index?=table)
        }
        if flags < 4 {
          if flags != 0 && r.byte() != 0 {
            raise Invalid(at, "Unsupported element kind")
          }
          let n = r.count()
          for j = 0; j < n; j = j + 1 {
            let offset = r.pos
            let target = r.bounded_int()
            scan.edge(kind, i, target, kind, offset, table_index?=table)
          }
        } else {
          if flags != 4 {
            r.value_type()
          }
          let n = r.count()
          for j = 0; j < n; j = j + 1 {
            scan_expression(r, scan, kind, i, table_index?=table)
          }
        }
      }
    }
  }
  r.finish()
}

///|
fn build_references(
  data : Bytes,
  sections : Array[Section],
  functions : Array[FunctionBody],
  imports : (Int, Int, Int)?,
  names : Map[Int, String],
  budget : ResourceBudget,
) -> ReferenceGraph raise ParseError {
  let issues : Array[ReferenceIssue] = []
  guard imports is Some((imported, imported_tables, imported_globals)) else {
    return {
      status: "unavailable",
      decoded_functions: 0,
      total_functions: functions.length(),
      nodes: [],
      edges: [],
      roots: [],
      dynamic_references: [],
      issues: [
        {
          source_kind: "import",
          source_index: 0,
          offset: 8,
          message: "Function index space unavailable",
        },
      ],
    }
  }
  let count = imported + functions.length()
  let edges : Array[ReferenceEdge] = []
  let roots : Array[ReferenceRoot] = []
  let dynamic : Array[DynamicReference] = []
  let statuses = Array::make(count, "imported")
  let mut decoded = 0
  // Each region is transactional: a failed scan contributes no speculative edges.
  for section in sections {
    if section.id != 4 &&
      section.id != 6 &&
      section.id != 7 &&
      section.id != 8 &&
      section.id != 9 {
      continue
    }
    let r : Reader = {
      data,
      pos: section.offset + section.header_bytes,
      end: section.offset + section.total_bytes,
      budget,
    }
    let scan : ReferenceScan = {
      edges: [],
      roots: [],
      dynamic: [],
      budget,
      function_count: count,
    }
    try {
      scan_reference_section(
        section.id,
        r,
        scan,
        imported_tables,
        imported_globals,
      )
      edges.append(scan.edges)
      roots.append(scan.roots)
      dynamic.append(scan.dynamic)
    } catch {
      ResourceLimit(at, message) => raise ResourceLimit(at, message)
      Invalid(at, message) =>
        issues.push({
          source_kind: section.label,
          source_index: 0,
          offset: at,
          message,
        })
    }
  }
  for f in functions {
    let index = imported + f.ordinal
    let r : Reader = {
      data,
      pos: f.offset + f.prefix_bytes,
      end: f.offset + f.total_bytes,
      budget,
    }
    let scan : ReferenceScan = {
      edges: [],
      roots: [],
      dynamic: [],
      budget,
      function_count: count,
    }
    try {
      let locals = r.count()
      for i = 0; i < locals; i = i + 1 {
        ignore(r.u32())
        r.value_type()
      }
      scan_expression(r, scan, "function", index)
      r.finish()
      edges.append(scan.edges)
      dynamic.append(scan.dynamic)
      statuses[index] = "decoded"
      decoded += 1
    } catch {
      ResourceLimit(at, message) => raise ResourceLimit(at, message)
      Invalid(at, message) => {
        statuses[index] = "incomplete"
        issues.push({
          source_kind: "function",
          source_index: index,
          offset: at,
          message,
        })
      }
    }
  }
  for section in sections {
    if section.id > 13 {
      issues.push({
        source_kind: "section",
        source_index: section.id,
        offset: section.offset,
        message: "Unknown section may contain references",
      })
    }
  }
  let nodes : Array[ReferenceNode] = Array::makei(count, fn(index) {
    {
      function_index: index,
      name: names.get(index),
      scan_status: statuses[index],
      incoming: [],
      outgoing: [],
      root_index: None,
      parent_edge: None,
    }
  })
  for i = 0; i < edges.length(); i = i + 1 {
    let edge = edges[i]
    nodes[edge.target].incoming.push(i)
    if edge.source_kind == "function" {
      nodes[edge.source_index].outgoing.push(i)
    }
  }
  let queue : Array[Int] = []
  let mut head = 0
  // Prefer export/start roots over declaration roots for presentation.
  for entry in [true, false] {
    for i = 0; i < roots.length(); i = i + 1 {
      let root = roots[i]
      if (root.kind == "export" || root.kind == "start") != entry {
        continue
      }
      let node = nodes[root.function_index]
      if node.root_index == None {
        nodes[root.function_index] = { ..node, root_index: Some(i), }
        queue.push(root.function_index)
      }
    }
    while head < queue.length() {
      let node = nodes[queue[head]]
      head += 1
      for edge_index in node.outgoing {
        let edge = edges[edge_index]
        let target = nodes[edge.target]
        if target.root_index == None {
          nodes[edge.target] = {
            ..target,
            root_index: node.root_index,
            parent_edge: Some(edge_index),
          }
          queue.push(edge.target)
        }
      }
    }
  }
  {
    status: if !issues.is_empty() || !dynamic.is_empty() {
      "partial"
    } else {
      "decoded"
    },
    decoded_functions: decoded,
    total_functions: functions.length(),
    nodes,
    edges,
    roots,
    dynamic_references: dynamic,
    issues,
  }
}
