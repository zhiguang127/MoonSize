// Derived from moonbit-community/cmark src/char/html.mbt (Apache-2.0).
// Keys are ASCII, lexically sorted by the generator. MoonBit's default
// String comparison is length-first; use lexical_compare explicitly here.
///|
fn html_named_entity(name : String) -> String? {
  let mut low = 0
  let mut high = html_entity_names.length()
  while low < high {
    let middle = low + (high - low) / 2
    let candidate = html_entity_names[middle]
    if name == candidate {
      return Some(html_entity_values[middle])
    } else if name.lexical_compare(candidate) < 0 {
      high = middle
    } else {
      low = middle + 1
    }
  }
  None
}
