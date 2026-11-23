#!/usr/bin/env bash
# Shared helpers of the preview-screenshots workflow. Source this file.
#
# resolve_flows <platform> <tooling-dir> <flows-dir> <token>...
#   Prints "<name><TAB><flow path>" for every token that applies to <platform>
#   (android or ios). A token is either
#     - a screen name, e.g. "reflect": testing/preview/<name>.<platform>.yaml
#       from <tooling-dir>; or
#     - a Maestro flow path under testing/, e.g.
#       testing/android-e2e/android-foo.yaml, read from <flows-dir> (the pull
#       request head). The platform comes from the file name prefix
#       "android-" or "ios-"; other flows are skipped on this platform.
resolve_flows() {
  local platform="$1" tooling="$2" flows="$3"
  shift 3
  local token path base name seen=' '
  for token in "$@"; do
    if [[ "$token" == */* ]]; then
      [[ "$token" == testing/* && "$token" != *..* && "$token" =~ \.ya?ml$ ]] || {
        echo "Invalid flow path '$token': expected testing/.../<android-|ios->name.yaml" >&2; return 1; }
      base="$(basename "$token")"
      case "$base" in
        "$platform"-*) ;;
        android-*|ios-*) continue ;;
        *) echo "Invalid flow path '$token': the file name must start with android- or ios-" >&2; return 1 ;;
      esac
      path="$flows/$token"
      name="${base%.*}"
      [[ -f "$path" ]] || { echo "Flow '$token' does not exist in the pull request head." >&2; return 1; }
    else
      name="$token"
      path="$tooling/testing/preview/$token.$platform.yaml"
      [[ -f "$path" ]] || {
        echo "Unknown preview screen '$token': testing/preview/$token.$platform.yaml does not exist." >&2
        return 1
      }
    fi
    [[ "$seen" != *" $name "* ]] || { echo "Preview screen '$name' is listed twice." >&2; return 1; }
    seen+="$name "
    printf '%s\t%s\n' "$name" "$path"
  done
}

# collect_screenshots <maestro output dir> <out dir>
# Copies the images a flow took with takeScreenshot into <out dir>. The images
# Maestro saves itself for failed or optional steps ("screenshot-*", "step-*")
# are not evidence and are skipped.
collect_screenshots() {
  local from="$1" out="$2" file n=0
  mkdir -p "$out"
  while IFS= read -r file; do
    case "$(basename "$file")" in screenshot-*|step-*) continue ;; esac
    cp "$file" "$out/$(basename "$file")"
    n=$((n + 1))
  done < <(find "$from" -type f -name '*.png' | sort)
  echo "$n"
}

# ios_simulator_udid: prints the UDID of an available "iPhone 17 Pro" on the
# newest installed iOS runtime.
ios_simulator_udid() {
  xcrun simctl list devices available -j | python3 -c '
import json, sys
runtimes = json.load(sys.stdin)["devices"]
def version(key):
    return [int(x) for x in key.rsplit(".", 1)[-1].split("-") if x.isdigit()]
for key in sorted(runtimes, key=version, reverse=True):
    for device in runtimes[key]:
        if device["name"] == "iPhone 17 Pro" and device.get("isAvailable", True):
            print(device["udid"]); sys.exit(0)
sys.exit("No available iPhone 17 Pro simulator on this runner.")
'
}
