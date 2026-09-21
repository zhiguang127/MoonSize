///|
/// Compare aggregate section sizes. Repeated custom sections with the same name
/// are grouped. Function indices are deliberately not matched across builds.
pub fn compare(before : Analysis, after : Analysis) -> Comparison {
  let keys : Array[(Int, String?)] = []
  let old : Map[(Int, String?), Int] = Map([])
  let current : Map[(Int, String?), Int] = Map([])
  for section in before.sections {
    let key = (section.id, section.custom_name)
    if !old.contains(key) {
      keys.push(key)
    }
    old[key] = old.get(key).unwrap_or(0) + section.total_bytes
  }
  for section in after.sections {
    let key = (section.id, section.custom_name)
    if !old.contains(key) && !current.contains(key) {
      keys.push(key)
    }
    current[key] = current.get(key).unwrap_or(0) + section.total_bytes
  }
  let sections = keys.map(fn(key) {
    let before_bytes = old.get(key).unwrap_or(0)
    let after_bytes = current.get(key).unwrap_or(0)
    {
      id: key.0,
      label: section_label(key.0),
      custom_name: key.1,
      before_bytes,
      after_bytes,
      delta_bytes: after_bytes - before_bytes,
    }
  })
  let (functions, matching) = compare_functions(
    before.functions,
    after.functions,
  )
  let code_delta = sections.fold(init=0, fn(n, s) {
    if s.id == 10 {
      n + s.delta_bytes
    } else {
      n
    }
  })
  {
    schema_version: 3,
    before_bytes: before.total_bytes,
    after_bytes: after.total_bytes,
    delta_bytes: after.total_bytes - before.total_bytes,
    sections,
    packages: compare_packages(before.functions, after.functions),
    functions,
    code_overhead_delta_bytes: code_delta -
    (matching.after.total_bytes - matching.before.total_bytes),
    matching,
  }
}

///|
/// Absolute growth is signed: shrinking builds pass a zero-growth budget.
/// Limits are inclusive. Negative limits are rejected.
pub fn check_budget(
  comparison : Comparison,
  max_bytes? : Int,
  max_growth_bytes? : Int,
) -> Budget raise ParseError {
  check_size_budget(
    comparison.before_bytes,
    comparison.after_bytes,
    max_bytes?,
    max_growth_bytes?,
  )
}

///|
/// Check independently measured sizes using the same inclusive, signed policy.
pub fn check_size_budget(
  before_bytes : Int,
  after_bytes : Int,
  max_bytes? : Int,
  max_growth_bytes? : Int,
) -> Budget raise ParseError {
  if before_bytes < 0 || after_bytes < 0 {
    raise Invalid(0, "Measured sizes must be nonnegative")
  }
  let delta_bytes = after_bytes - before_bytes
  let violations : Array[String] = []
  if max_bytes is Some(limit) {
    if limit < 0 {
      raise Invalid(0, "max_bytes must be nonnegative")
    }
    if after_bytes > limit {
      violations.push("Total \{after_bytes} bytes exceeds limit \{limit}")
    }
  }
  if max_growth_bytes is Some(limit) {
    if limit < 0 {
      raise Invalid(0, "max_growth_bytes must be nonnegative")
    }
    if delta_bytes > limit {
      violations.push("Growth \{delta_bytes} bytes exceeds limit \{limit}")
    }
  }
  {
    passed: violations.is_empty(),
    actual_bytes: after_bytes,
    growth_bytes: delta_bytes,
    max_bytes,
    max_growth_bytes,
    violations,
  }
}
