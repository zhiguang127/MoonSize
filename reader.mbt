///|
priv struct Reader {
  data : Bytes
  mut pos : Int
  end : Int
  budget : ResourceBudget
}

///|
fn Reader::byte(self : Reader) -> Int raise ParseError {
  if self.pos >= self.end {
    raise Invalid(self.pos, "Unexpected end of input")
  }
  let b = self.data[self.pos].to_int()
  self.pos += 1
  b
}

// Accept non-minimal encodings permitted by the Wasm binary format.

///|
fn Reader::u32(self : Reader) -> UInt raise ParseError {
  let start = self.pos
  let mut result = 0U
  for i = 0; i < 5; i = i + 1 {
    let b = self.byte()
    if i == 4 && b > 15 {
      raise Invalid(start, "Unsigned LEB128 exceeds 32 bits")
    }
    result = result | ((b & 127).reinterpret_as_uint() << (i * 7))
    if b < 128 {
      return result
    }
  }
  raise Invalid(start, "Unterminated unsigned LEB128")
}

///|
fn Reader::bounded_int(self : Reader) -> Int raise ParseError {
  let start = self.pos
  let value = self.u32()
  if value > 2147483647U {
    raise Invalid(start, "Value exceeds the supported 2 GiB range")
  }
  value.reinterpret_as_int()
}

///|
fn Reader::span(self : Reader, size : Int) -> Reader raise ParseError {
  if size < 0 || size > self.end - self.pos {
    raise Invalid(self.pos, "Declared length exceeds containing region")
  }
  let start = self.pos
  self.pos += size
  { data: self.data, pos: start, end: self.pos, budget: self.budget, }
}

///|
fn Reader::string(self : Reader) -> String raise ParseError {
  let size = self.bounded_int()
  if size > max_name_bytes {
    raise ResourceLimit(self.pos, "Name exceeds limit \{max_name_bytes} bytes")
  }
  if size > max_total_name_bytes - self.budget.names_bytes {
    raise ResourceLimit(
      self.pos,
      "Total name bytes exceed limit \{max_total_name_bytes}",
    )
  }
  self.budget.names_bytes += size
  let bytes = self.span(size)
  @utf8.decode(bytes.data[bytes.pos:bytes.end]) catch {
    _ => raise Invalid(bytes.pos, "Invalid UTF-8 name")
  }
}

///|
fn Reader::count(self : Reader) -> Int raise ParseError {
  let count = self.bounded_int()
  if count > self.end - self.pos {
    raise Invalid(self.pos, "Vector count exceeds available bytes")
  }
  count
}

///|
fn Reader::finish(self : Reader) -> Unit raise ParseError {
  if self.pos != self.end {
    raise Invalid(self.pos, "Unexpected trailing bytes in parsed region")
  }
}

// Skip an s33 heap type while checking its termination and unused bits.

///|
fn Reader::heap_type(self : Reader) -> Unit raise ParseError {
  let start = self.pos
  for i = 0; i < 5; i = i + 1 {
    let b = self.byte()
    if i == 4 && !(b <= 15 || (b >= 112 && b <= 127)) {
      raise Invalid(start, "Signed LEB128 exceeds 33 bits")
    }
    if b < 128 {
      return
    }
  }
  raise Invalid(start, "Unterminated heap type")
}

///|
fn Reader::value_type(self : Reader) -> Unit raise ParseError {
  let b = self.byte()
  if b == 0x63 || b == 0x64 {
    self.heap_type()
  } else if !(b >= 0x65 && b <= 0x73) && !(b >= 0x7B && b <= 0x7F) {
    raise Invalid(self.pos - 1, "Unsupported value type in import metadata")
  }
}

///|
fn Reader::u64_skip(self : Reader) -> Unit raise ParseError {
  let start = self.pos
  for i = 0; i < 10; i = i + 1 {
    let b = self.byte()
    if i == 9 && b > 1 {
      raise Invalid(start, "Unsigned LEB128 exceeds 64 bits")
    }
    if b < 128 {
      return
    }
  }
  raise Invalid(start, "Unterminated unsigned LEB128")
}

///|
fn Reader::limits(self : Reader) -> Unit raise ParseError {
  let flags = self.bounded_int()
  if flags > 7 {
    raise Invalid(self.pos, "Unsupported limits flags in import metadata")
  }
  if (flags & 4) != 0 {
    self.u64_skip()
    if (flags & 1) != 0 {
      self.u64_skip()
    }
  } else {
    ignore(self.u32())
    if (flags & 1) != 0 {
      ignore(self.u32())
    }
  }
}
