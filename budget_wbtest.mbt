///|
test "host measured budgets preserve inclusive and signed boundaries" {
  assert_true(
    check_size_budget(100, 125, max_bytes=125, max_growth_bytes=25).passed,
  )
  assert_true(check_size_budget(125, 100, max_growth_bytes=0).passed)
  let failed = check_size_budget(100, 125, max_bytes=124, max_growth_bytes=24)
  assert_eq(failed.violations.length(), 2)
  assert_eq(failed.actual_bytes, 125)
  assert_eq(failed.growth_bytes, 25)
  assert_true(check_size_budget(2147483647, 0, max_growth_bytes=0).passed)
  assert_false(check_size_budget(0, 2147483647, max_growth_bytes=0).passed)
}

///|
test "host measured budgets reject negative sizes and limits" {
  for pair in [(-1, 0), (0, -1)] {
    let rejected = try {
      ignore(check_size_budget(pair.0, pair.1))
      false
    } catch {
      Invalid(_, _) => true
      _ => false
    }
    assert_true(rejected)
  }
  let rejected = try {
    ignore(check_size_budget(1, 2, max_growth_bytes=-1))
    false
  } catch {
    Invalid(_, _) => true
    _ => false
  }
  assert_true(rejected)
}
