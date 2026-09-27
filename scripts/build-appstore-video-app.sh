#!/usr/bin/env bash
# Build an isolated Release simulator app with the local video mock URL.
set -euo pipefail
cd "$(dirname "$0")/.."

PORT=9086
MOCK_URL="http://127.0.0.1:$PORT"
WORK_DIR="${PRAY_VIDEO_SCRATCH_DIR:?Set PRAY_VIDEO_SCRATCH_DIR to an external scratch directory}"
LOG_DIR="$WORK_DIR/build-logs"
TARGET_APP="$WORK_DIR/Lampada-video-mock.app"
mkdir -p "$LOG_DIR"

case "$WORK_DIR" in /*) ;; *) echo 'Build output must use an absolute scratch path' >&2; exit 1 ;; esac
case "$WORK_DIR" in "$(pwd -P)"/*) [[ "$WORK_DIR" == "$(pwd -P)/store/video/runs/"* ]] || { echo 'Build output inside the repository must be under store/video/runs' >&2; exit 1; } ;; esac
[ -f app/reflect.tsx ] || { echo 'Video JS source is missing' >&2; exit 1; }
[ ! -e "$TARGET_APP" ] || { echo "Build target already exists: $TARGET_APP" >&2; exit 1; }

NATIVE_SOURCE="$(pwd -P)"
[ -d ios/Lampada.xcworkspace ] || {
  echo 'Missing ios/Lampada.xcworkspace. Generate native iOS files with: npx expo prebuild --platform ios' >&2
  exit 1
}

if [ "$(plutil -extract NSAppTransportSecurity.NSAllowsLocalNetworking raw -o - "$NATIVE_SOURCE/ios/Lampada/Info.plist")" != true ]; then
  echo 'Native Info.plist does not permit local networking' >&2
  exit 1
fi

set +e
EXPO_NO_DOTENV=1 EXPO_PUBLIC_API_URL="$MOCK_URL" \
  EXPO_PUBLIC_AI_PROXY_KEY=video-preview-mock EXPO_PUBLIC_BUILD_CHANNEL=test \
  EXPO_PUBLIC_APPSTORE_VIDEO=1 \
  xcrun xcodebuild -workspace "$NATIVE_SOURCE/ios/Lampada.xcworkspace" -scheme Lampada \
    -configuration Release -destination 'generic/platform=iOS Simulator' \
    -derivedDataPath "$WORK_DIR/native-build" CODE_SIGNING_ALLOWED=NO build \
    > "$LOG_DIR/xcodebuild.log" 2>&1
build_rc=$?
set -e
printf '%s\n' "$build_rc" > "$LOG_DIR/xcodebuild.exit"
if [ "$build_rc" -ne 0 ]; then tail -35 "$LOG_DIR/xcodebuild.log" >&2; exit "$build_rc"; fi
SOURCE_APP="$WORK_DIR/native-build/Build/Products/Release-iphonesimulator/Lampada.app"

[ -f "$SOURCE_APP/main.jsbundle" ] || { echo 'Release JS bundle missing' >&2; exit 1; }
[ "$(plutil -extract NSAppTransportSecurity.NSAllowsLocalNetworking raw -o - "$SOURCE_APP/Info.plist")" = true ] || {
  echo 'Native app does not permit local networking' >&2
  exit 1
}
ditto "$SOURCE_APP" "$TARGET_APP"

set +e
(EXPO_NO_DOTENV=1 EXPO_PUBLIC_API_URL="$MOCK_URL" \
  EXPO_PUBLIC_AI_PROXY_KEY=video-preview-mock EXPO_PUBLIC_BUILD_CHANNEL=test \
  EXPO_PUBLIC_APPSTORE_VIDEO=1 npx expo export:embed --platform ios --dev false \
  --entry-file node_modules/expo-router/entry.js \
  --bundle-output "$TARGET_APP/main.jsbundle" --assets-dest "$TARGET_APP") \
  > "$LOG_DIR/export.log" 2>&1
export_rc=$?
set -e
printf '%s\n' "$export_rc" > "$LOG_DIR/export.exit"
if [ "$export_rc" -ne 0 ]; then tail -35 "$LOG_DIR/export.log" >&2; exit "$export_rc"; fi
grep -q -a -F "$MOCK_URL" "$TARGET_APP/main.jsbundle" || {
  echo 'Mock URL is missing from the Release JS bundle' >&2
  exit 1
}
shasum -a 256 "$TARGET_APP/main.jsbundle" > "$LOG_DIR/main-jsbundle.sha256"
git rev-parse HEAD > "$LOG_DIR/source-commit.txt"
printf '%s\n' "$MOCK_URL" > "$LOG_DIR/mock-url.txt"
printf 'Video mock Release app: %s; logs: %s\n' "$TARGET_APP" "$LOG_DIR"
