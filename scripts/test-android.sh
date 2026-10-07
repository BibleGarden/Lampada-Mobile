#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ "$#" -eq 0 ]]; then
  echo 'Usage: test-android.sh <flow-name> [flow-name ...]' >&2
  exit 2
fi
flows=("$@")
for flow in "${flows[@]}"; do
  [[ "$flow" =~ ^[a-zA-Z0-9_-]+$ && -f "testing/android-e2e/$flow.yaml" ]] || {
    echo 'Expected an existing Android flow name without a path or extension.' >&2
    exit 2
  }
done

device="${ANDROID_TEST_DEVICE:-emulator-5554}"
run_dir="${ANDROID_TEST_OUTPUT_DIR:-$(mktemp -d "${TMPDIR:-/tmp/}lampada-android-e2e.XXXXXX")}"
mkdir -p "$run_dir"
echo "Android test output: $run_dir"

for tool in adb maestro apkanalyzer node npm; do
  command -v "$tool" >/dev/null || { echo "Required tool is missing from PATH: $tool" >&2; exit 1; }
done
if npm run env:check:local > "$run_dir/environment.log" 2>&1; then
  printf '0\n' > "$run_dir/environment.exit"
else
  result=$?
  printf '%s\n' "$result" > "$run_dir/environment.exit"
  cat "$run_dir/environment.log" >&2
  exit "$result"
fi
[[ "$(adb -s "$device" shell getprop sys.boot_completed | tr -d '\r')" == 1 ]] || { echo 'Android has not booted' >&2; exit 1; }
adb -s "$device" shell dumpsys package com.nf404.twinkler > "$run_dir/installed-package.log"
grep -q 'versionName=' "$run_dir/installed-package.log" || { echo 'Lampada is not installed' >&2; exit 1; }
if grep -q DEBUGGABLE "$run_dir/installed-package.log"; then
  echo 'Install the standalone Release build before testing; Debug warnings can intercept taps.' >&2
  exit 1
fi
apk_paths="$(adb -s "$device" shell pm path com.nf404.twinkler | tr -d '\r')"
apk_path="$(printf '%s\n' "$apk_paths" | sed -n 's/^package:\(.*\/base\.apk\)$/\1/p')"
[[ -n "$apk_path" && "$apk_path" != *$'\n'* ]] || { echo 'Expected one installed base APK path.' >&2; exit 1; }
trap 'rm -f "$run_dir/installed-base.apk"' EXIT
adb -s "$device" pull "$apk_path" "$run_dir/installed-base.apk" > "$run_dir/apk-pull.log" 2>&1
apkanalyzer manifest print "$run_dir/installed-base.apk" > "$run_dir/installed-manifest.xml"
node scripts/validate-installed-android.mjs "$run_dir/installed-manifest.xml" .env.local
rm "$run_dir/installed-base.apk"
locale="$(adb -s "$device" shell settings get system system_locales | tr -d '\r')"
[[ "$locale" == ru-RU* ]] || { echo "Expected Russian as the primary Android locale, got $locale" >&2; exit 1; }

export MAESTRO_DRIVER_STARTUP_TIMEOUT=180000
printf 'flow\texit\n' > "$run_dir/results.tsv"
for flow in "${flows[@]}"; do
  echo "Starting $flow"
  # Relaunch must immediately follow smoke-full: it verifies the saved data.
  set +e
  maestro --device "$device" test --test-output-dir "$run_dir/$flow" \
    "testing/android-e2e/$flow.yaml" > "$run_dir/$flow.log" 2>&1
  result=$?
  set -e
  printf '%s\t%s\n' "$flow" "$result" >> "$run_dir/results.tsv"
  printf '%s\n' "$result" > "$run_dir/$flow.exit"
  echo "$flow exit=$result"
  if [[ "$result" -ne 0 ]]; then
    echo "Stopped at first failure; full log: $run_dir/$flow.log" >&2
    exit "$result"
  fi
done
echo "All ${#flows[@]} selected Android scenarios passed."
