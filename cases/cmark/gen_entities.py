#!/usr/bin/env python3
# Derived from moonbit-community/cmark src/char/gen_entities.py (Apache-2.0).
# MoonSize experiment: sorted parallel arrays avoid constructing a Json map.
import argparse
import json
import subprocess
from pathlib import Path


def quote(value):
    # Match the upstream generator's MoonBit string escaping.
    value = repr(value)[1:-1]
    if value == '"':
        value = r'\"'
    elif value.startswith(r'\x'):
        value = r'\u{' + value[2:] + '}'
    return '"' + value + '"'


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('input')
    parser.add_argument('output')
    args = parser.parse_args()
    entities = json.loads(Path(args.input).read_text(encoding='utf-8'))
    rows = sorted((key[1:-1], value['characters']) for key, value in entities.items() if key.endswith(';'))
    assert all(key.isascii() for key, _ in rows)
    output = '// Generated from the pinned upstream entities.json. Do not edit.\n'
    for column, name in [(0, 'html_entity_names'), (1, 'html_entity_values')]:
        output += f'///|\nlet {name} : FixedArray[String] = [\n'
        output += ''.join('  ' + quote(row[column]) + ',\n' for row in rows)
        output += ']\n'
    Path(args.output).write_text(output, encoding='utf-8')
    subprocess.run(['moonfmt', '-w', args.output], check=True)


if __name__ == '__main__':
    main()
