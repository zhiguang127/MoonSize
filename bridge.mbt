///|
fn error_json(at : Int, message : String) -> Json {
  {
    "ok": false,
    "error": { "code": "invalid_input", "offset": at, "message": message },
  }
}

///|
/// Host-measured sizes, with -1 representing an absent limit.
pub fn size_budget_json(
  before_bytes : Int,
  after_bytes : Int,
  max_bytes : Int,
  max_growth_bytes : Int,
) -> String {
  let result : Json = try {
    let max = if max_bytes == -1 { None } else { Some(max_bytes) }
    let growth = if max_growth_bytes == -1 {
      None
    } else {
      Some(max_growth_bytes)
    }
    let budget = check_size_budget(
      before_bytes,
      after_bytes,
      max_bytes?=max,
      max_growth_bytes?=growth,
    )
    { "ok": true, "budget": ToJson::to_json(budget) }
  } catch {
    ResourceLimit(at, message) => resource_error_json(at, message)
    Invalid(at, message) => error_json(at, message)
  }
  result.stringify()
}

///|
fn resource_error_json(at : Int, message : String) -> Json {
  {
    "ok": false,
    "error": { "code": "resource_limit", "offset": at, "message": message },
  }
}

///|
pub fn limits_json() -> String {
  let limits : Json = {
    "max_input_bytes": max_input_bytes,
    "max_sections": max_sections,
    "max_functions": max_functions,
    "max_metadata_entries": max_metadata_entries,
    "max_name_bytes": max_name_bytes,
    "max_total_name_bytes": max_total_name_bytes,
    "max_reference_entries": max_reference_entries,
    "max_control_depth": max_control_depth,
  }
  limits.stringify()
}

///|
/// JSON bridge for the Node CLI and browser. All parsing stays in MoonBit.
pub fn analyze_json(data : Bytes) -> String {
  let result : Json = try {
    let analysis = analyze(data)
    { "ok": true, "analysis": ToJson::to_json(analysis) }
  } catch {
    ResourceLimit(at, message) => resource_error_json(at, message)
    Invalid(at, message) => error_json(at, message)
  }
  result.stringify()
}

///|
pub fn compare_json(before : Bytes, after : Bytes) -> String {
  let result : Json = try {
    let a = analyze(before)
    let b = analyze(after)
    {
      "ok": true,
      "before": ToJson::to_json(a),
      "after": ToJson::to_json(b),
      "comparison": ToJson::to_json(compare(a, b)),
    }
  } catch {
    ResourceLimit(at, message) => resource_error_json(at, message)
    Invalid(at, message) => error_json(at, message)
  }
  result.stringify()
}

///|
/// -1 means no limit at the JS boundary; other negative values are invalid.
pub fn budget_json(
  before : Bytes,
  after : Bytes,
  max_bytes : Int,
  max_growth_bytes : Int,
) -> String {
  let result : Json = try {
    let a = analyze(before)
    let b = analyze(after)
    let comparison = compare(a, b)
    let max = if max_bytes == -1 { None } else { Some(max_bytes) }
    let growth = if max_growth_bytes == -1 {
      None
    } else {
      Some(max_growth_bytes)
    }
    let budget = check_budget(
      comparison,
      max_bytes?=max,
      max_growth_bytes?=growth,
    )
    {
      "ok": true,
      "before": ToJson::to_json(a),
      "after": ToJson::to_json(b),
      "comparison": ToJson::to_json(comparison),
      "budget": ToJson::to_json(budget),
    }
  } catch {
    ResourceLimit(at, message) => resource_error_json(at, message)
    Invalid(at, message) => error_json(at, message)
  }
  result.stringify()
}
