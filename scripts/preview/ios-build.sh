#!/usr/bin/env bash
# Builds the app in <app-dir> for the iOS simulator (Release, as
# `npx expo run:ios` in README.md) and installs it on an "iPhone 17 Pro"
# simulator, booting it first.
#
# Usage: ios-build.sh <app-dir> <tooling-dir> <log-dir>
# Needs EXPO_PUBLIC_API_URL and EXPO_PUBLIC_AI_PROXY_KEY in the environment.
set -euo pipefail
app="${1:?app-dir}" tooling="${2:?tooling-dir}" logs="${3:?log-dir}"
# shellcheck source=screens.sh
source "$tooling/scripts/preview/screens.sh"
mkdir -p "$logs"
udid="$(ios_simulator_udid)"
echo "Simulator: $udid"
xcrun simctl boot "$udid" 2>/dev/null || true
xcrun simctl bootstatus "$udid" -b >"$logs/bootstatus.log" 2>&1

cd "$app"
export EXPO_PUBLIC_BUILD_CHANNEL=test EXPO_NO_DOTENV=1 CI=1
{
  npx expo prebuild --platform ios
  npx expo run:ios --configuration Release --device "$udid" --no-bundler
} >"$logs/build.log" 2>&1 || { tail -n 60 "$logs/build.log" >&2; echo 'The iOS build failed.' >&2; exit 1; }
tail -n 15 "$logs/build.log"
xcrun simctl get_app_container "$udid" twinkler app >/dev/null \
  || { echo 'The app (twinkler) is not installed on the simulator.' >&2; exit 1; }
