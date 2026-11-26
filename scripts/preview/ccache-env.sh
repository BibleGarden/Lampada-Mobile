#!/usr/bin/env bash
# ccache for the iOS pods (React Native wraps the compiler when USE_CCACHE=1 is
# set while `pod install` runs). Source this file; it needs ccache on PATH.
# The cache directory is the default one of ccache: Xcode runs the compiler
# with its own filtered environment, so a CCACHE_DIR set here would not reach it
# (the workflow caches the directory that `ccache -k cache_dir` prints).
command -v ccache >/dev/null || { echo 'ccache is not installed.' >&2; exit 1; }
export USE_CCACHE=1
