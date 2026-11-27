#!/bin/bash
# Xcode's own compilation cache (Xcode 26) for the iOS build. Source this file.
#
# It turns the cache on for every target, including the pods, through an
# xcconfig file that xcodebuild reads from XCODE_XCCONFIG_FILE, and puts the
# cache in one directory that the workflow saves and restores. The cache is
# content-addressed, so entries of an older build stay valid. React Native's
# ccache wrapper (USE_CCACHE) is not used: Xcode's build system does not call
# the compiler through the CC build setting, so ccache would see no compilation.
PREVIEW_XCODE_CACHE_DIR="${PREVIEW_XCODE_CACHE_DIR:-$HOME/Library/Caches/preview-xcode-cas}"
mkdir -p "$PREVIEW_XCODE_CACHE_DIR"
xcconfig="${RUNNER_TEMP:-/tmp}/preview-xcode-cache.xcconfig"
cat >"$xcconfig" <<EOF2
COMPILATION_CACHE_ENABLE_CACHING = YES
COMPILATION_CACHE_CAS_PATH = $PREVIEW_XCODE_CACHE_DIR
COMPILATION_CACHE_ENABLE_DIAGNOSTIC_REMARKS = YES
EOF2
export XCODE_XCCONFIG_FILE="$xcconfig"
