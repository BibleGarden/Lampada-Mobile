#!/usr/bin/env python3
"""Merge Play-only screenshot copy over the shared App Store video fixture."""
import json
import sys
from pathlib import Path

base_path, overlay_path, locale_arg, output_path = sys.argv[1:5]
base_path, overlay_path, output_path = map(Path, (base_path, overlay_path, output_path))
base = json.loads(base_path.read_text())
overlay = json.loads(overlay_path.read_text())
code = locale_arg
if set(overlay['locales']) != {code} or set(overlay['locales'][code]) - {'typed', 'questions', 'passages', 'catalog'}:
    raise ValueError('Invalid Play screenshot overlay')
item = {**base['locales'][code], **overlay['locales'][code]}
if 'catalog' in overlay['locales'][code]:
    item['catalog'] = {**base['locales'][code]['catalog'], **overlay['locales'][code]['catalog']}
fixture = {**base, 'status': overlay['status'], 'locales': {code: item}}
output_path.write_text(json.dumps(fixture, ensure_ascii=False, indent=2) + '\n')
