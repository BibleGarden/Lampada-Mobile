#!/usr/bin/env bash
# Builds the app in <app-dir> for the iOS simulator (Release, as
# `npx expo run:ios` in README.md) on an "iPhone 17 Pro" simulator, which it
# boots first, and copies the built app to <out-dir>/twinkler.app. The native
# project and the pods must be ready (ios-prebuild.sh, ios-pods.sh).
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
# shellcheck source=ccache-env.sh
source "$tooling/scripts/preview/ccache-env.sh"
mkdir -p "$logs" "$out"
udid="$(ios_simulator_udid)"
echo "Simulator: $udid"
phase_run simulator-boot bash -c 'xcrun simctl boot "$1" 2>/dev/null || true; xcrun simctl bootstatus "$1" -b' _ "$udid" >"$logs/bootstatus.log" 2>&1

cd "$app"
ccache --zero-stats >/dev/null
# EXPO_PROFILE makes xcodebuild print its build timing summary (compile versus
# script phases such as the JS bundle).
EXPO_PROFILE=1 phase_run xcodebuild-and-install npx expo run:ios --configuration Release --device "$udid" --no-bundler \
  >"$logs/build.log" 2>&1 || { tail -n 60 "$logs/build.log" >&2; echo 'The iOS build failed.' >&2; exit 1; }
tail -n 15 "$logs/build.log"
sed -n '/Build Timing Summary/,$p' "$logs/build.log" | head -40 >"$logs/build-timing.txt" || true
ccache --show-stats >"$logs/ccache-stats.txt" 2>&1 || true
cat "$logs/ccache-stats.txt"

bundle="$(xcrun simctl get_app_container "$udid" twinkler app)" \
  || { echo 'The app (twinkler) is not installed on the simulator.' >&2; exit 1; }
rm -rf "$out/twinkler.app"
ditto "$bundle" "$out/twinkler.app"
echo "App: $(du -sh "$out/twinkler.app" | cut -f1)"
