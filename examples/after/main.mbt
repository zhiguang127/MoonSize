// Deliberately add a reachable feature to make binary growth reproducible.
///|
fn main {
  let message = "MoonSize,WebAssembly,sections,function bodies,build comparison,byte budgets,debug names,deterministic output"
  let mut count = 0
  for word in message.split(",") {
    println("feature[\{count}]: \{word}")
    count += 1
  }
  println("\{count} features enabled")
}
