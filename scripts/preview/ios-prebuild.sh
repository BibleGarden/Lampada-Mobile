#!/usr/bin/env bash
# Generates the native iOS project of the app in <app-dir> (`expo prebuild`
# without `pod install`: the pods come next, after the CocoaPods cache restore).
#
# Usage: ios-prebuild.sh <app-dir> <tooling-dir> <log-dir>
# Needs EXPO_PUBLIC_API_URL and EXPO_PUBLIC_AI_PROXY_KEY in the environment.
set -euo pipefail
app="${1:?app-dir}" tooling="${2:?tooling-dir}" logs="${3:?log-dir}"
# shellcheck source=phases.sh
source "$tooling/scripts/preview/phases.sh"
# shellcheck source=env.sh
source "$tooling/scripts/preview/env.sh"
mkdir -p "$logs"
cd "$app"
phase_run prebuild npx expo prebuild --platform ios --no-install >"$logs/prebuild.log" 2>&1 \
  || { tail -n 60 "$logs/prebuild.log" >&2; echo 'expo prebuild failed.' >&2; exit 1; }
