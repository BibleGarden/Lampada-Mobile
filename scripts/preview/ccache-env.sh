#!/usr/bin/env bash
# ccache for the iOS pods (React Native wraps the compiler when USE_CCACHE=1 is
# set while `pod install` runs). Source this file; it needs ccache on PATH.
command -v ccache >/dev/null || { echo 'ccache is not installed.' >&2; exit 1; }
export USE_CCACHE=1
export CCACHE_DIR="${CCACHE_DIR:-${RUNNER_TEMP:-/tmp}/ccache}"
export CCACHE_MAXSIZE="${CCACHE_MAXSIZE:-3G}"
