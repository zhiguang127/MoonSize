// Copyright 2026 International Digital Economy Academy (source grammar).
// Licensed under Apache-2.0. Adapted from MoonBit runtime/backtrace.c in
// moonc v0.10.12+1634b282e. This MoonBit implementation adds bounded parsing,
// strict whole-input consumption, and explicit unsupported-symbol fallback.

///|
pub(all) struct Symbol {
  raw : String
  display : String
  package_name : String?
  status : String
  kind : String
} derive(Debug)

///|
priv suberror SymbolError {
  BadSymbol
}

///|
priv struct SymbolReader {
  data : Bytes
  mut pos : Int
}

///|
fn SymbolReader::peek(self : SymbolReader) -> Int {
  if self.pos < self.data.length() {
    self.data[self.pos].to_int()
  } else {
    -1
  }
}

///|
fn SymbolReader::take(
  self : SymbolReader,
  value : Int,
) -> Unit raise SymbolError {
  if self.peek() != value {
    raise BadSymbol
  }
  self.pos += 1
}

///|
fn SymbolReader::decimal_text(self : SymbolReader) -> String raise SymbolError {
  let start = self.pos
  while self.peek() >= 48 && self.peek() <= 57 {
    self.pos += 1
  }
  if self.pos == start {
    raise BadSymbol
  }
  @utf8.decode(self.data[start:self.pos]) catch {
    _ => raise BadSymbol
  }
}

///|
fn SymbolReader::decimal(self : SymbolReader) -> Int raise SymbolError {
  let start = self.pos
  let mut n = 0
  while self.peek() >= 48 && self.peek() <= 57 {
    n = n * 10 + self.peek() - 48
    if n > max_name_bytes {
      raise BadSymbol
    }
    self.pos += 1
  }
  if self.pos == start {
    raise BadSymbol
  }
  n
}

///|
fn hex_digit(b : Int) -> Int raise SymbolError {
  if b >= 48 && b <= 57 {
    b - 48
  } else if b >= 65 && b <= 70 {
    b - 55
  } else if b >= 97 && b <= 102 {
    b - 87
  } else {
    raise BadSymbol
  }
}

///|
fn SymbolReader::identifier(self : SymbolReader) -> String raise SymbolError {
  let length = self.decimal()
  if length > self.data.length() - self.pos {
    raise BadSymbol
  }
  let end = self.pos + length
  let decoded : Array[Byte] = []
  while self.pos < end {
    let b = self.peek()
    self.pos += 1
    if b != 95 {
      decoded.push(b.to_byte())
    } else if self.pos < end && self.peek() == 95 {
      decoded.push(95)
      self.pos += 1
    } else {
      if end - self.pos < 2 {
        raise BadSymbol
      }
      let hi = hex_digit(self.peek())
      self.pos += 1
      let lo = hex_digit(self.peek())
      self.pos += 1
      decoded.push((hi * 16 + lo).to_byte())
    }
  }
  @utf8.decode(Bytes::from_array(decoded)[:]) catch {
    _ => raise BadSymbol
  }
}

///|
fn join_symbol_parts(parts : Array[String], separator : String) -> String {
  let b = StringBuilder()
  for i = 0; i < parts.length(); i = i + 1 {
    if i > 0 {
      b.write_string(separator)
    }
    b.write_string(parts[i])
  }
  b.to_string()
}

///|
fn SymbolReader::package_segments(
  self : SymbolReader,
  count : Int,
) -> String raise SymbolError {
  if count > 64 {
    raise BadSymbol
  }
  let segments : Array[String] = []
  for i = 0; i < count; i = i + 1 {
    segments.push(self.identifier())
  }
  join_symbol_parts(segments, "/")
}

///|
fn SymbolReader::package_path(self : SymbolReader) -> String raise SymbolError {
  self.take(80)
  if self.peek() == 66 {
    self.pos += 1
    return "moonbitlang/core/builtin"
  }
  let core = self.peek() == 67
  if core {
    self.pos += 1
  }
  let start = self.pos
  let suffix = try {
    let count = self.decimal()
    self.package_segments(count)
  } catch {
    _ => {
      self.pos = start
      let count = self.peek() - 48
      if count < 0 || count > 9 {
        raise BadSymbol
      }
      self.pos += 1
      self.package_segments(count)
    }
  }
  if core {
    if suffix == "" {
      "moonbitlang/core"
    } else {
      "moonbitlang/core/" + suffix
    }
  } else {
    suffix
  }
}

///|
fn qualified(pkg : String, name : String) -> String {
  if pkg == "" {
    "@" + name
  } else {
    "@" + pkg + "." + name
  }
}

///|
fn SymbolReader::type_path(self : SymbolReader) -> String raise SymbolError {
  let pkg = self.package_path()
  let name = self.identifier()
  let local_name = if self.peek() == 76 {
    self.pos += 1
    "." + self.identifier()
  } else {
    ""
  }
  qualified(pkg, name + local_name)
}

///|
fn SymbolReader::type_arg(
  self : SymbolReader,
  depth : Int,
) -> String raise SymbolError {
  if depth > 32 {
    raise BadSymbol
  }
  let kind = self.peek()
  self.pos += 1
  match kind {
    105 => "Int"
    108 => "Int64"
    104 => "Int16"
    106 => "UInt"
    107 => "UInt16"
    109 => "UInt64"
    100 => "Double"
    102 => "Float"
    98 => "Bool"
    99 => "Char"
    115 => "String"
    117 => "Unit"
    121 => "Byte"
    122 => "Bytes"
    118 => "V128"
    65 => "FixedArray[" + self.type_arg(depth + 1) + "]"
    79 => "Option[" + self.type_arg(depth + 1) + "]"
    82 => self.type_path() + self.type_args(depth + 1)
    85 => "(" + self.type_list(depth + 1) + ")"
    86 | 87 => {
      if kind == 86 {
        self.take(87)
      }
      let args = self.type_list(depth + 1)
      let result = self.type_arg(depth + 1)
      let error = if self.peek() == 81 {
        self.pos += 1
        " raise " + self.type_arg(depth + 1)
      } else {
        ""
      }
      (if kind == 86 { "async " } else { "" }) +
      "(" +
      args +
      ") -> " +
      result +
      error
    }
    _ => raise BadSymbol
  }
}

///|
fn SymbolReader::type_list(
  self : SymbolReader,
  depth : Int,
) -> String raise SymbolError {
  let args : Array[String] = []
  while self.peek() != 69 {
    args.push(self.type_arg(depth + 1))
  }
  self.take(69)
  join_symbol_parts(args, ", ")
}

///|
fn SymbolReader::type_args(
  self : SymbolReader,
  depth : Int,
) -> String raise SymbolError {
  if depth > 32 {
    raise BadSymbol
  }
  let generic = if self.peek() == 71 {
    self.pos += 1
    "[" + self.type_list(depth + 1) + "]"
  } else {
    ""
  }
  let error = if self.peek() == 72 {
    self.pos += 1
    " raise " + self.type_arg(depth + 1)
  } else {
    ""
  }
  generic + error
}

///|
fn SymbolReader::fn_suffix(self : SymbolReader) -> String raise SymbolError {
  let names : Array[String] = []
  while self.peek() == 78 {
    self.pos += 1
    names.push("." + self.identifier())
    self.take(83)
    ignore(self.decimal_text())
  }
  if self.peek() == 67 {
    self.pos += 1
    ignore(self.decimal_text())
    if self.peek() == 108 {
      self.pos += 1
      names.push(".anon(l" + self.decimal_text() + ")")
    } else {
      names.push(".anon")
    }
  }
  join_symbol_parts(names, "")
}

///|
/// Decode the supported MoonBit v0 mangling grammar. Unknown, malformed,
/// truncated or excessively nested symbols retain their original spelling.
pub fn decode_symbol(raw : String) -> Symbol {
  if raw.length() > max_name_bytes {
    return {
      raw,
      display: raw,
      package_name: None,
      status: "unsupported",
      kind: "unknown",
    }
  }
  let bytes = @utf8.encode(raw)
  let start = if bytes.length() > 0 && bytes[0] == 36 { 1 } else { 0 }
  let looks_mangled = bytes.length() - start >= 2 &&
    bytes[start] == 95 &&
    bytes[start + 1] == 77
  let fallback : Symbol = {
    raw,
    display: raw,
    package_name: None,
    status: if looks_mangled {
      "unsupported"
    } else {
      "plain"
    },
    kind: "unknown",
  }
  if !looks_mangled || bytes.length() > max_name_bytes {
    return fallback
  }
  try {
    let r : SymbolReader = { data: bytes, pos: start, }
    r.take(95)
    r.take(77)
    r.take(48)
    let tag = r.peek()
    r.pos += 1
    let mut pkg : String? = None
    let (kind, display) = match tag {
      70 | 77 => {
        let package_name = r.package_path()
        if package_name != "" {
          pkg = Some(package_name)
        }
        let first = r.identifier()
        let name = if tag == 77 { first + "::" + r.identifier() } else { first }
        (
          if tag == 77 {
            "method"
          } else {
            "function"
          },
          qualified(package_name, name) +
          r.fn_suffix() +
          r.type_args(0) +
          r.fn_suffix(),
        )
      }
      73 => {
        let receiver = r.type_path()
        let trait_name = r.type_path()
        let name = r.identifier()
        let suffix = r.fn_suffix()
        let generic = r.type_args(0)
        // Type/trait packages do not prove the implementation's source package.
        (
          "trait_impl",
          "impl " +
          trait_name +
          " for " +
          receiver +
          generic +
          " with " +
          name +
          suffix +
          r.fn_suffix(),
        )
      }
      69 => {
        let type_pkg = r.package_path()
        let receiver = r.identifier()
        let method_pkg = r.package_path()
        if method_pkg != "" {
          pkg = Some(method_pkg)
        }
        let method_name = r.identifier()
        (
          "extension_method",
          qualified(
            method_pkg,
            qualified(type_pkg, receiver) + "::" + method_name,
          ) +
          r.fn_suffix() +
          r.type_args(0) +
          r.fn_suffix(),
        )
      }
      84 => ("type", r.type_path())
      76 => {
        if r.peek() == 109 {
          r.pos += 1
        }
        let name = r.identifier()
        r.take(83)
        ignore(r.decimal_text())
        ("local", "@" + name)
      }
      _ => raise BadSymbol
    }
    if r.pos != bytes.length() {
      raise BadSymbol
    }
    { raw, display, package_name: pkg, status: "decoded", kind, }
  } catch {
    _ => fallback
  }
}

///|
pub impl ToJson for Symbol with fn to_json(self) {
  {
    "raw": self.raw,
    "display": self.display,
    "package_name": nullable_json(self.package_name),
    "status": self.status,
    "kind": self.kind,
  }
}
