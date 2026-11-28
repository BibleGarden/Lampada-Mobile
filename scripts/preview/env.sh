#!/usr/bin/env bash
# Build environment of the preview apps. Source this file in the build scripts.
# The file is part of the app cache key (app-key.sh), so a change here builds a
# new app. The secret values (EXPO_PUBLIC_API_URL, EXPO_PUBLIC_AI_PROXY_KEY)
# come from the workflow; only a hash of them goes into the key.
export EXPO_PUBLIC_BUILD_CHANNEL=test EXPO_NO_DOTENV=1 CI=1
