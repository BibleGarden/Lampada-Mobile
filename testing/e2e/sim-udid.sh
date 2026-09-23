#!/usr/bin/env bash
# Печатает UDID симулятора по имени из таблицы в AGENTS.md; падает, если такого
# симулятора нет или их несколько.
set -euo pipefail
xcrun simctl list devices available -j | python3 -c '
import json, sys
name = sys.argv[1]
found = [x["udid"] for runtime in json.load(sys.stdin)["devices"].values() for x in runtime if x["name"] == name]
if len(found) != 1:
    sys.exit(f"симулятор «{name}»: найдено {len(found)}, нужен ровно один (см. AGENTS.md)")
print(found[0])
' "$1"
