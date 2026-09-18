///|
/// A structural parsing error, with a byte offset in the original file.
pub suberror ParseError {
  Invalid(Int, String)
  ResourceLimit(Int, String)
} derive(Debug)

///|
/// Section sizes include the section ID and encoded payload length.
pub(all) struct Section {
  id : Int
  label : String
  custom_name : String?
  offset : Int
  header_bytes : Int
  payload_bytes : Int
  total_bytes : Int
} derive(Debug)

///|
/// Function bodies are a breakdown of the code section, not extra file bytes.
pub(all) struct FunctionBody {
  ordinal : Int
  function_index : Int?
  name : String?
  symbol : Symbol?
  offset : Int
  body_bytes : Int
  prefix_bytes : Int
  total_bytes : Int
} derive(Debug)

///|
pub(all) struct Analysis {
  schema_version : Int
  total_bytes : Int
  module_header_bytes : Int
  sections : Array[Section]
  functions : Array[FunctionBody]
  references : ReferenceGraph
  warnings : Array[String]
} derive(ToJson, Debug)

///|
pub(all) struct SectionDelta {
  id : Int
  label : String
  custom_name : String?
  before_bytes : Int
  after_bytes : Int
  delta_bytes : Int
} derive(Debug)

///|
pub(all) struct Comparison {
  schema_version : Int
  before_bytes : Int
  after_bytes : Int
  delta_bytes : Int
  sections : Array[SectionDelta]
  packages : Array[PackageDelta]
  functions : Array[FunctionDelta]
  matching : MatchingCoverage
  code_overhead_delta_bytes : Int
} derive(ToJson, Debug)

///|
pub(all) struct Budget {
  passed : Bool
  actual_bytes : Int
  growth_bytes : Int
  max_bytes : Int?
  max_growth_bytes : Int?
  violations : Array[String]
} derive(Debug)
