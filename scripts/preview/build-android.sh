#!/usr/bin/env bash
# Builds an x86_64 Release APK of the app in <app-dir> (an emulator on an
# x86_64 runner cannot run the ARM libraries) with the same prebuild and Gradle
# steps as scripts/capture-play-screenshots.sh, and copies it to <out-dir>/app-release.apk.
#
# Usage: build-android.sh <app-dir> <tooling-dir> <out-dir>
# Needs EXPO_PUBLIC_API_URL and EXPO_PUBLIC_AI_PROXY_KEY in the environment.
set -euo pipefail
app="${1:?Usage: build-android.sh <app-dir> <tooling-dir> <out-dir>}" tooling="${2:?tooling-dir}" out="${3:?out-dir}"
# shellcheck source=phases.sh
source "$tooling/scripts/preview/phases.sh"
# shellcheck source=env.sh
source "$tooling/scripts/preview/env.sh"
mkdir -p "$out"
cd "$app"
phase_run prebuild npx expo prebuild --platform android
# The Gradle build cache (--build-cache) is the part of ~/.gradle/caches that
# the workflow restores between runs.
(cd android && NODE_ENV=production phase_run gradle ./gradlew assembleRelease -PreactNativeArchitectures=x86_64 --build-cache --console=plain)
apk=android/app/build/outputs/apk/release/app-release.apk
[[ -f "$apk" ]] || { echo "APK was not produced: $apk" >&2; exit 1; }
cp "$apk" "$out/app-release.apk"
echo "APK: $(du -h "$out/app-release.apk" | cut -f1)"
# Release the Gradle daemon so that the cache save sees no locked files.
(cd "$app/android" && ./gradlew --stop >/dev/null 2>&1) || true
