#!/usr/bin/env bash
# Выбираем одну подключённую цель до того, как Expo или Maestro выберут её сами.
set -euo pipefail

platform="$1"
shift
explicit=''
args=("$@")
for ((i=0; i<${#args[@]}; i++)); do
  case "${args[i]}" in
    --device|-d)
      [[ -z "$explicit" && $((i + 1)) -lt ${#args[@]} && -n "${args[i+1]}" ]] || {
        echo 'Specify exactly one --device <serial or simulator>.' >&2; exit 2;
      }
      explicit="${args[i+1]}"
      ((i+=1))
      ;;
    --device=*|-d=*) explicit="${args[i]#*=}" ;;
  esac
done

if [[ -n "$explicit" ]]; then
  if [[ "$platform" == android ]]; then
    [[ "$explicit" != RFCW90KWKBH ]] || { echo 'Owner phone is prohibited.' >&2; exit 2; }
    adb_bin="${ANDROID_HOME:-$HOME/Library/Android/sdk}/platform-tools/adb"
    if [[ "$explicit" == emulator-* ]]; then
      "$adb_bin" -s "$explicit" get-state >/dev/null
    else
      matched=''
      while IFS= read -r serial; do
        [[ "$serial" == emulator-* ]] || continue
        name="$("$adb_bin" -s "$serial" emu avd name | head -1 | tr -d '\r')"
        [[ "$name" == "$explicit" ]] && matched="$serial"
      done < <("$adb_bin" devices | awk 'NR > 1 && $2 == "device" { print $1 }')
      [[ -n "$matched" ]] || { echo "Android target $explicit is not a running emulator; use its serial or AVD name." >&2; exit 2; }
      explicit="$matched"
    fi
  else
    xcrun simctl list devices booted -j | python3 -c \
      'import json,sys; target=sys.argv[1]; sys.exit(not any(d["udid"] == target and d["state"] == "Booted" for ds in json.load(sys.stdin)["devices"].values() for d in ds))' "$explicit" || {
        echo "iOS simulator $explicit is not booted." >&2; exit 2;
      }
  fi
  printf '%s\n' "$explicit"
  exit 0
fi

if [[ "$platform" == android ]]; then
  adb_bin="${ANDROID_HOME:-$HOME/Library/Android/sdk}/platform-tools/adb"
  devices=()
  while IFS= read -r device; do devices+=("$device"); done < <("$adb_bin" devices | awk 'NR > 1 && $2 == "device" { print $1 }')
else
  devices=()
  while IFS= read -r device; do devices+=("$device"); done < <(xcrun simctl list devices booted -j | python3 -c \
    'import json,sys; print("\n".join(d["udid"] for ds in json.load(sys.stdin)["devices"].values() for d in ds if d["state"] == "Booted"))')
fi
if ((${#devices[@]} != 1)); then
  echo "Found ${#devices[@]} connected $platform targets; pass --device <serial or simulator> explicitly." >&2
  exit 2
fi
[[ "${devices[0]}" != RFCW90KWKBH ]] || { echo 'Owner phone is prohibited.' >&2; exit 2; }
printf '%s\n' "${devices[0]}"
