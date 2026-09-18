// Explicit nulls keep the public JSON shape stable when names or limits are
// absent. Derived struct serialization otherwise omits Option::None fields.

///|
fn[T : ToJson] nullable_json(value : T?) -> Json {
  match value {
    Some(value) => value.to_json()
    None => Json::null()
  }
}

///|
pub impl ToJson for PackageDelta with fn to_json(self) {
  {
    "package_name": nullable_json(self.package_name),
    "before_bytes": self.before_bytes,
    "after_bytes": self.after_bytes,
    "delta_bytes": self.delta_bytes,
    "before_functions": self.before_functions,
    "after_functions": self.after_functions,
  }
}

///|
pub impl ToJson for FunctionDelta with fn to_json(self) {
  {
    "before": nullable_json(self.before),
    "after": nullable_json(self.after),
    "match_kind": self.match_kind,
    "confidence": self.confidence,
    "change": self.change,
    "reason": self.reason,
    "delta_bytes": nullable_json(self.delta_bytes),
  }
}

///|
pub impl ToJson for ReferenceEdge with fn to_json(self) {
  {
    "source_kind": self.source_kind,
    "source_index": self.source_index,
    "target": self.target,
    "kind": self.kind,
    "offset": self.offset,
    "table_index": nullable_json(self.table_index),
  }
}

///|
pub impl ToJson for DynamicReference with fn to_json(self) {
  {
    "source_kind": self.source_kind,
    "source_index": self.source_index,
    "kind": self.kind,
    "offset": self.offset,
    "table_index": nullable_json(self.table_index),
    "type_index": nullable_json(self.type_index),
  }
}

///|
pub impl ToJson for ReferenceNode with fn to_json(self) {
  {
    "function_index": self.function_index,
    "name": nullable_json(self.name),
    "scan_status": self.scan_status,
    "incoming": self.incoming,
    "outgoing": self.outgoing,
    "root_index": nullable_json(self.root_index),
    "parent_edge": nullable_json(self.parent_edge),
  }
}

///|
pub impl ToJson for InclusionPath with fn to_json(self) {
  {
    "status": self.status,
    "root": nullable_json(self.root),
    "edges": self.edges,
  }
}

///|
pub impl ToJson for Section with fn to_json(self) {
  {
    "id": self.id,
    "label": self.label,
    "custom_name": nullable_json(self.custom_name),
    "offset": self.offset,
    "header_bytes": self.header_bytes,
    "payload_bytes": self.payload_bytes,
    "total_bytes": self.total_bytes,
  }
}

///|
pub impl ToJson for FunctionBody with fn to_json(self) {
  {
    "ordinal": self.ordinal,
    "function_index": nullable_json(self.function_index),
    "name": nullable_json(self.name),
    "symbol": nullable_json(self.symbol),
    "offset": self.offset,
    "body_bytes": self.body_bytes,
    "prefix_bytes": self.prefix_bytes,
    "total_bytes": self.total_bytes,
  }
}

///|
pub impl ToJson for Budget with fn to_json(self) {
  {
    "passed": self.passed,
    "actual_bytes": self.actual_bytes,
    "growth_bytes": self.growth_bytes,
    "max_bytes": nullable_json(self.max_bytes),
    "max_growth_bytes": nullable_json(self.max_growth_bytes),
    "violations": ToJson::to_json(self.violations),
  }
}

///|
pub impl ToJson for SectionDelta with fn to_json(self) {
  {
    "id": self.id,
    "label": self.label,
    "custom_name": nullable_json(self.custom_name),
    "before_bytes": self.before_bytes,
    "after_bytes": self.after_bytes,
    "delta_bytes": self.delta_bytes,
  }
}
