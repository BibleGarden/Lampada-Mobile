#!/usr/bin/env bash
# Builds the app in <app-dir> for the iOS simulator (Release, as
# `npx expo run:ios` in README.md) on an "iPhone 17 Pro" simulator, which it
# boots first, and copies the built app to <out-dir>/twinkler.app. The native
# project and the pods must be ready (ios-prebuild.sh); `expo run:ios` installs the pods itself.
#
# Usage: ios-build.sh <app-dir> <tooling-dir> <log-dir> <out-dir>
# Needs EXPO_PUBLIC_API_URL and EXPO_PUBLIC_AI_PROXY_KEY in the environment.
set -euo pipefail
app="${1:?app-dir}" tooling="${2:?tooling-dir}" logs="${3:?log-dir}" out="${4:?out-dir}"
# shellcheck source=screens.sh
source "$tooling/scripts/preview/screens.sh"
# shellcheck source=phases.sh
source "$tooling/scripts/preview/phases.sh"
# shellcheck source=env.sh
source "$tooling/scripts/preview/env.sh"
# shellcheck source=xcode-cache-env.sh
source "$tooling/scripts/preview/xcode-cache-env.sh"
mkdir -p "$logs" "$out"
udid="$(ios_simulator_udid)"
echo "Simulator: $udid"
phase_run simulator-boot bash -c 'xcrun simctl boot "$1" 2>/dev/null || true; xcrun simctl bootstatus "$1" -b' _ "$udid" >"$logs/bootstatus.log" 2>&1

cd "$app"
# Every line of the build output gets the time it arrived (seconds since the
# epoch), so that log-gaps.sh can show where the build spent its time.
stamp() {
  local line
  while IFS= read -r line; do printf '%s %s\n' "$(date +%s)" "$line"; done
}
cache_before="$(du -sk "$PREVIEW_XCODE_CACHE_DIR" | cut -f1)"
derived="$HOME/Library/Developer/Xcode/DerivedData"
mkdir -p "$derived"
echo "DerivedData before the build: $(($(du -sk "$derived" | cut -f1) / 1024)) MB"
phase_run xcodebuild-and-install npx expo run:ios --configuration Release --device "$udid" --no-bundler 2>&1 \
  | stamp >"$logs/build.log" || { tail -n 60 "$logs/build.log" | cut -d' ' -f2- >&2; echo 'The iOS build failed.' >&2; exit 1; }
tail -n 15 "$logs/build.log" | cut -d' ' -f2-
{
  echo "compilation cache before the build: $((cache_before / 1024)) MB"
  echo "compilation cache after the build:  $(($(du -sk "$PREVIEW_XCODE_CACHE_DIR" | cut -f1) / 1024)) MB"
  echo "DerivedData after the build:         $(($(du -sk "$derived" | cut -f1) / 1024)) MB"
} >"$logs/compilation-cache.txt"
cat "$logs/compilation-cache.txt"
bash "$tooling/scripts/preview/log-gaps.sh" "$logs/build.log" >"$logs/build-timeline.txt" || true
cat "$logs/build-timeline.txt"

bundle="$(xcrun simctl get_app_container "$udid" twinkler app)" \
  || { echo 'The app (twinkler) is not installed on the simulator.' >&2; exit 1; }
rm -rf "$out/twinkler.app"
ditto "$bundle" "$out/twinkler.app"
echo "App: $(du -sh "$out/twinkler.app" | cut -f1)"
