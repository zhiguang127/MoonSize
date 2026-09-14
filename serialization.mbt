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
