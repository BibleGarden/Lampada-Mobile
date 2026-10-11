#!/usr/bin/env bash
# Готовит драйвер Maestro к прогону с --no-reinstall-driver: установленный
# драйвер или сервер переиспользуется, пока он байт в байт совпадает с APK
# текущего Maestro; другой удаляется, и первый сценарий ставит текущий.
# Версии пакетов для этого бесполезны: у всех выпусков Maestro они одинаковы.
# Usage: android-maestro-driver.sh <device> <log-dir>
set -euo pipefail

if [[ "$#" -ne 2 ]]; then
  echo 'Usage: android-maestro-driver.sh <device> <log-dir>' >&2
  exit 2
fi
device="$1"
log_dir="$2"
maestro="$(command -v maestro)" || { echo 'Required tool is missing from PATH: maestro' >&2; exit 1; }
jar="$(cd -P "$(dirname "$(readlink -f "$maestro")")/.." && pwd)/lib/maestro-client.jar"
[[ -f "$jar" ]] || { echo "Maestro client library not found: $jar" >&2; exit 1; }

for spec in dev.mobile.maestro:maestro-app.apk dev.mobile.maestro.test:maestro-server.apk; do
  package="${spec%%:*}"
  installed="$(adb -s "$device" shell pm list packages "$package" | tr -d '\r')"
  if ! grep -qx "package:$package" <<< "$installed"; then
    echo "maestro-driver $package missing; the first flow installs it"
    continue
  fi
  paths="$(adb -s "$device" shell pm path "$package" | tr -d '\r' | sed -n 's/^package://p')"
  [[ -n "$paths" && "$paths" != *$'\n'* ]] || { echo "Expected one installed APK path for $package." >&2; exit 1; }
  expected="$(unzip -p "$jar" "${spec#*:}" | shasum -a 256 | cut -d' ' -f1)"
  [[ "$expected" =~ ^[0-9a-f]{64}$ ]] || { echo "Cannot hash ${spec#*:} from $jar" >&2; exit 1; }
  actual="$(adb -s "$device" shell sha256sum "$paths" | tr -d '\r' | cut -d' ' -f1)"
  if [[ "$actual" == "$expected" ]]; then
    echo "maestro-driver $package matches the current Maestro; reused"
  else
    adb -s "$device" uninstall "$package" > "$log_dir/uninstall-$package.log"
    echo "maestro-driver $package differs from the current Maestro; removed"
  fi
done
