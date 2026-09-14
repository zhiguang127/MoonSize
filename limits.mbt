///|
/// Hard resource ceilings for the v0.2 analyzer. Shared by every frontend.
pub let max_input_bytes : Int = 64 * 1024 * 1024

///|
pub let max_sections : Int = 4096

///|
pub let max_functions : Int = 50000

///|
pub let max_metadata_entries : Int = 100000

///|
pub let max_name_bytes : Int = 4096

///|
pub let max_total_name_bytes : Int = 4 * 1024 * 1024

///|
priv struct ResourceBudget {
  mut names_bytes : Int
  mut metadata_entries : Int
}

///|
fn ResourceBudget::entries(
  self : ResourceBudget,
  count : Int,
  at : Int,
) -> Unit raise ParseError {
  if count > max_metadata_entries - self.metadata_entries {
    raise ResourceLimit(
      at,
      "Metadata entry count exceeds limit \{max_metadata_entries}",
    )
  }
  self.metadata_entries += count
}
