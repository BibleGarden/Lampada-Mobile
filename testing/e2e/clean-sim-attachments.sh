#!/usr/bin/env bash
# Удаляет скриншоты XCTest-драйвера Maestro из остановленного симулятора:
# <симулятор>/data/Containers/Data/InternalDaemon/<id>/tmp/Attachments в
# контейнере com.apple.testmanagerd. Maestro их не чистит; на Pray Smoke
# iPhone 17 Pro они доросли до 24 ГБ. Трогает только этот каталог.
# Использование: clean-sim-attachments.sh "<имя симулятора>"
set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "usage: $0 \"<simulator name>\"" >&2
  exit 2
fi

udid=$("$(dirname "$0")/sim-udid.sh" "$1")

state=$(xcrun simctl list devices -j | python3 -c '
import json, sys
udid = sys.argv[1]
print(next(x["state"] for runtime in json.load(sys.stdin)["devices"].values() for x in runtime if x["udid"] == udid))
' "$udid")
if [ "$state" != "Shutdown" ]; then
  echo "simulator "$1" is $state: shut it down first (xcrun simctl shutdown $udid)" >&2
  exit 1
fi

containers="$HOME/Library/Developer/CoreSimulator/Devices/$udid/data/Containers/Data/InternalDaemon"
[ -d "$containers" ] || { echo "missing directory $containers" >&2; exit 1; }

found=0
for container in "$containers"/*/; do
  id=$(plutil -extract MCMMetadataIdentifier raw "$container.com.apple.mobile_container_manager.metadata.plist")
  [ "$id" = "com.apple.testmanagerd" ] || continue
  attachments="${container}tmp/Attachments"
  [ -d "$attachments" ] || continue
  found=1
  kb=$(du -sk "$attachments" | cut -f1)
  rm -rf "$attachments"
  echo "freed $((kb / 1024)) MB in "$1""
done
[ "$found" -eq 1 ] || echo "nothing to clean in "$1""
