#!/usr/bin/env bash
# Starts booting the "iPhone 17 Pro" simulator and returns at once, so that the
# boot (one to three minutes) overlaps the steps that come before the build or
# the capture. The scripts that use the simulator wait for it (bootstatus).
#
# Usage: ios-boot.sh <tooling-dir>
set -euo pipefail
tooling="${1:?tooling-dir}"
# shellcheck source=screens.sh
source "$tooling/scripts/preview/screens.sh"
udid="$(ios_simulator_udid)"
xcrun simctl boot "$udid" 2>/dev/null || true
echo "Booting the simulator $udid."
