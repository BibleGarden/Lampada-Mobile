#!/usr/bin/env bash
# Prints a simulator's UDID by its name from the table in AGENTS.md; fails if
# there is no such simulator or there are several.
set -euo pipefail
xcrun simctl list devices available -j | python3 -c '
import json, sys
name = sys.argv[1]
found = [x["udid"] for runtime in json.load(sys.stdin)["devices"].values() for x in runtime if x["name"] == name]
if len(found) != 1:
    sys.exit(f"simulator '{name}': found {len(found)}, need exactly one (see AGENTS.md)")
print(found[0])
' "$1"
