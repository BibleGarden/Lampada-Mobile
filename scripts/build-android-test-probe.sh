#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

: "${ANDROID_HOME:?ANDROID_HOME is required}"
: "${ANDROID_PROBE_OUTPUT:?ANDROID_PROBE_OUTPUT is required}"
tools="$ANDROID_HOME/build-tools/36.0.0"
platform="$ANDROID_HOME/platforms/android-36/android.jar"
mkdir -p "$ANDROID_PROBE_OUTPUT/classes" "$ANDROID_PROBE_OUTPUT/dex"
javac --release 8 -cp "$platform" -d "$ANDROID_PROBE_OUTPUT/classes" \
  scripts/android-test-probe/DatabaseProbe.java
"$tools/d8" --lib "$platform" --output "$ANDROID_PROBE_OUTPUT/dex" \
  "$ANDROID_PROBE_OUTPUT/classes/garden/lampada/testprobe/DatabaseProbe.class"
"$tools/aapt2" link -I "$platform" \
  --manifest scripts/android-test-probe/AndroidManifest.xml \
  -o "$ANDROID_PROBE_OUTPUT/probe-unsigned.apk"
(cd "$ANDROID_PROBE_OUTPUT/dex" && zip -q -j "$ANDROID_PROBE_OUTPUT/probe-unsigned.apk" classes.dex)
"$tools/zipalign" -f 4 "$ANDROID_PROBE_OUTPUT/probe-unsigned.apk" "$ANDROID_PROBE_OUTPUT/probe-aligned.apk"
"$tools/apksigner" sign --ks android/app/debug.keystore --ks-key-alias androiddebugkey \
  --ks-pass pass:android --key-pass pass:android \
  --out "$ANDROID_PROBE_OUTPUT/LampadaTestProbe.apk" "$ANDROID_PROBE_OUTPUT/probe-aligned.apk"
"$tools/apksigner" verify "$ANDROID_PROBE_OUTPUT/LampadaTestProbe.apk"
echo "Android test database probe built and signature verified."
