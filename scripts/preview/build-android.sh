#!/usr/bin/env bash
# Builds an x86_64 Release APK of the app in <app-dir> (an emulator on an
# x86_64 runner cannot run the ARM libraries) with the same prebuild and Gradle
# steps as scripts/capture-play-screenshots.sh. Prints the APK path as the last line.
# Needs EXPO_PUBLIC_API_URL and EXPO_PUBLIC_AI_PROXY_KEY in the environment.
set -euo pipefail
app="${1:?Usage: build-android.sh <app-dir>}"
# shellcheck source=phases.sh
source "$(dirname "${BASH_SOURCE[0]}")/phases.sh"
cd "$app"
export EXPO_PUBLIC_BUILD_CHANNEL=test EXPO_NO_DOTENV=1 CI=1
phase_run prebuild npx expo prebuild --platform android
(cd android && NODE_ENV=production phase_run gradle ./gradlew assembleRelease -PreactNativeArchitectures=x86_64 --console=plain)
apk=android/app/build/outputs/apk/release/app-release.apk
[[ -f "$apk" ]] || { echo "APK was not produced: $apk" >&2; exit 1; }
echo "$PWD/$apk"
