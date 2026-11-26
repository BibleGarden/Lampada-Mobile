#!/usr/bin/env bash
# Shows where a timestamped build log (ios-build.sh writes "<epoch seconds> <line>")
# spent its time: the milestones and the longest waits between two lines.
#
# Usage: log-gaps.sh <build.log>
set -euo pipefail
python3 - "${1:?build.log}" <<'PY'
import re, sys
rows = []
for raw in open(sys.argv[1], errors='replace'):
    head, _, text = raw.rstrip('\n').partition(' ')
    if head.isdigit():
        rows.append((int(head), re.sub(r'\x1b\[[0-9;]*m', '', text)))
if not rows:
    sys.exit(0)
start = rows[0][0]
def first(pattern):
    return next((t for t, line in rows if re.search(pattern, line)), None)
def last(pattern):
    return next((t for t, line in reversed(rows) if re.search(pattern, line)), None)
print(f'build output: {rows[-1][0] - start} s, {len(rows)} lines')
for label, when in [
    ('JS bundle written', first(r'Done writing bundle output')),
    ('first compilation', first(r'^› Compiling ')),
    ('last compilation', last(r'^› Compiling ')),
    ('first linking', first(r'^› Linking ')),
    ('build succeeded', first(r'Build Succeeded')),
    ('app installed', first(r'^› Installing /')),
]:
    if when is not None:
        print(f'  {label}: +{when - start} s')
gaps = sorted(((rows[i][0] - rows[i - 1][0], rows[i][1]) for i in range(1, len(rows))), reverse=True)
print('longest waits before a line:')
for secs, line in gaps[:12]:
    if secs >= 10:
        print(f'  {secs:4d} s  {line[:110]}')
PY
