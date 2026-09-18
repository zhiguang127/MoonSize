///|
/// Hard resource ceilings for the analyzer. Shared by every frontend.
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
pub let max_reference_entries : Int = 200000

///|
pub let max_control_depth : Int = 4096

///|
priv struct ResourceBudget {
  mut names_bytes : Int
  mut metadata_entries : Int
  mut reference_entries : Int
}

///|
fn ResourceBudget::reference(
  self : ResourceBudget,
  at : Int,
) -> Unit raise ParseError {
  if self.reference_entries >= max_reference_entries {
    raise ResourceLimit(
      at,
      "Reference entry count exceeds limit \{max_reference_entries}",
    )
  }
  self.reference_entries += 1
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
