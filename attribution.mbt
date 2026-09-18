///|
/// Symbol-owned encoded function bodies, not dependency or removable size.
pub(all) struct PackageDelta {
  package_name : String?
  before_bytes : Int
  after_bytes : Int
  delta_bytes : Int
  before_functions : Int
  after_functions : Int
} derive(Debug)

///|
pub(all) struct FunctionDelta {
  before : FunctionBody?
  after : FunctionBody?
  match_kind : String
  confidence : String
  change : String
  reason : String
  delta_bytes : Int?
} derive(Debug)

///|
pub(all) struct SideCoverage {
  total_functions : Int
  matched_functions : Int
  total_bytes : Int
  matched_bytes : Int
  missing_name : Int
  ambiguous_name : Int
  symbol_only_here : Int
} derive(ToJson, Debug)

///|
pub(all) struct MatchingCoverage {
  before : SideCoverage
  after : SideCoverage
  exact_matches : Int
  inferred_matches : Int
} derive(ToJson, Debug)

///|
fn symbol_counts(functions : Array[FunctionBody]) -> Map[String, Int] {
  let counts : Map[String, Int] = Map([])
  for f in functions {
    if f.name is Some(name) && name != "" {
      counts[name] = counts.get(name).unwrap_or(0) + 1
    }
  }
  counts
}

///|
fn unmatched_reason(
  f : FunctionBody,
  own : Map[String, Int],
  other : Map[String, Int],
) -> String {
  match f.name {
    None | Some("") => "missing_name"
    Some(name) =>
      if own.get(name).unwrap_or(0) > 1 || other.get(name).unwrap_or(0) > 1 {
        "ambiguous_name"
      } else {
        "symbol_only_here"
      }
  }
}

///|
fn side_coverage(
  functions : Array[FunctionBody],
  own : Map[String, Int],
  other : Map[String, Int],
) -> SideCoverage {
  let mut matched = 0
  let mut total_bytes = 0
  let mut matched_bytes = 0
  let mut missing = 0
  let mut ambiguous = 0
  let mut only = 0
  for f in functions {
    total_bytes += f.total_bytes
    if f.name is Some(name) &&
      name != "" &&
      own.get(name) == Some(1) &&
      other.get(name) == Some(1) {
      matched += 1
      matched_bytes += f.total_bytes
    } else {
      match unmatched_reason(f, own, other) {
        "missing_name" => missing += 1
        "ambiguous_name" => ambiguous += 1
        _ => only += 1
      }
    }
  }
  {
    total_functions: functions.length(),
    matched_functions: matched,
    total_bytes,
    matched_bytes,
    missing_name: missing,
    ambiguous_name: ambiguous,
    symbol_only_here: only,
  }
}

///|
fn compare_functions(
  before : Array[FunctionBody],
  after : Array[FunctionBody],
) -> (Array[FunctionDelta], MatchingCoverage) {
  let old_counts = symbol_counts(before)
  let new_counts = symbol_counts(after)
  let new_unique : Map[String, FunctionBody] = Map([])
  for f in after {
    if f.name is Some(name) && name != "" && new_counts.get(name) == Some(1) {
      new_unique[name] = f
    }
  }
  let rows : Array[FunctionDelta] = []
  for f in before {
    let counterpart = match f.name {
      Some(name) =>
        if old_counts.get(name) == Some(1) {
          new_unique.get(name)
        } else {
          None
        }
      None => None
    }
    if counterpart is Some(g) {
      let delta = g.total_bytes - f.total_bytes
      rows.push({
        before: Some(f),
        after: Some(g),
        match_kind: "matched_exact",
        confidence: "exact",
        change: if delta > 0 {
          "grown"
        } else if delta < 0 {
          "shrunk"
        } else {
          "same_size"
        },
        reason: "unique_raw_symbol",
        delta_bytes: Some(delta),
      })
    } else {
      let reason = unmatched_reason(f, old_counts, new_counts)
      rows.push({
        before: Some(f),
        after: None,
        match_kind: "unmatched",
        confidence: "unavailable",
        change: if reason == "symbol_only_here" {
          "removed_symbol"
        } else {
          "unmatched_before"
        },
        reason,
        delta_bytes: if reason == "symbol_only_here" {
          Some(-f.total_bytes)
        } else {
          None
        },
      })
    }
  }
  for f in after {
    if f.name is Some(name) &&
      name != "" &&
      old_counts.get(name) == Some(1) &&
      new_counts.get(name) == Some(1) {
      continue
    }
    let reason = unmatched_reason(f, new_counts, old_counts)
    rows.push({
      before: None,
      after: Some(f),
      match_kind: "unmatched",
      confidence: "unavailable",
      change: if reason == "symbol_only_here" {
        "added_symbol"
      } else {
        "unmatched_after"
      },
      reason,
      delta_bytes: if reason == "symbol_only_here" {
        Some(f.total_bytes)
      } else {
        None
      },
    })
  }
  let a = side_coverage(before, old_counts, new_counts)
  let b = side_coverage(after, new_counts, old_counts)
  (
    rows,
    {
      before: a,
      after: b,
      exact_matches: a.matched_functions,
      inferred_matches: 0,
    },
  )
}

///|
fn package_key(f : FunctionBody) -> String? {
  match f.symbol {
    Some(symbol) => symbol.package_name
    None => None
  }
}

///|
fn compare_packages(
  before : Array[FunctionBody],
  after : Array[FunctionBody],
) -> Array[PackageDelta] {
  let keys : Array[String?] = []
  let old : Map[String?, (Int, Int)] = Map([])
  let current : Map[String?, (Int, Int)] = Map([])
  for f in before {
    let key = package_key(f)
    if !old.contains(key) {
      keys.push(key)
    }
    let (bytes, count) = old.get(key).unwrap_or((0, 0))
    old[key] = (bytes + f.total_bytes, count + 1)
  }
  for f in after {
    let key = package_key(f)
    if !old.contains(key) && !current.contains(key) {
      keys.push(key)
    }
    let (bytes, count) = current.get(key).unwrap_or((0, 0))
    current[key] = (bytes + f.total_bytes, count + 1)
  }
  keys.map(fn(key) {
    let (a, ac) = old.get(key).unwrap_or((0, 0))
    let (b, bc) = current.get(key).unwrap_or((0, 0))
    {
      package_name: key,
      before_bytes: a,
      after_bytes: b,
      delta_bytes: b - a,
      before_functions: ac,
      after_functions: bc,
    }
  })
}
