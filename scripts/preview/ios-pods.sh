#!/usr/bin/env bash
# Installs the CocoaPods of the generated iOS project in <app-dir>/ios. With
# ios/Pods and ios/Podfile.lock restored from the cache it only confirms them.
#
# Usage: ios-pods.sh <app-dir> <tooling-dir> <log-dir>
# Needs EXPO_PUBLIC_API_URL and EXPO_PUBLIC_AI_PROXY_KEY in the environment.
set -euo pipefail
app="${1:?app-dir}" tooling="${2:?tooling-dir}" logs="${3:?log-dir}"
# shellcheck source=phases.sh
source "$tooling/scripts/preview/phases.sh"
# shellcheck source=env.sh
source "$tooling/scripts/preview/env.sh"
mkdir -p "$logs"
cd "$app/ios"
LANG=en_US.UTF-8 phase_run pod-install pod install >"$logs/pod-install.log" 2>&1 \
  || { tail -n 60 "$logs/pod-install.log" >&2; echo 'pod install failed.' >&2; exit 1; }
tail -n 5 "$logs/pod-install.log"
