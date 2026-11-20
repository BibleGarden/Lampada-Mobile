#!/usr/bin/env bash
# Build Release and install Lampada on a connected iPhone.
# Usage: npm run iphone
#   Overridable via environment:
#     DEVICE=<udid>   — a specific device (default: the first connected iPhone)
#     TEAM=<teamId>   — signing team (default: Maria Novikov's paid team)
set -euo pipefail

cd "$(dirname "$0")/.."

export EXPO_PUBLIC_BUILD_CHANNEL=test

TEAM="${TEAM:-4SC2JCE37N}"                 # Maria Novikov (paid team)
BUNDLE="${BUNDLE:-twinkler}"
BUILD_DIR="$(pwd -P)/ios/build"
MODULE_CACHE="$BUILD_DIR/ModuleCache.noindex"

echo "▶︎ Checking runtime variables for the local Release build…"
bash scripts/check-runtime-env.sh local

node scripts/bump-version.mjs test

# --- native folder --------------------------------------------------------------------
# Sync the configuration and permission strings even when ios/ already exists.
echo "▶︎ Synchronizing native iOS configuration…"
npx expo prebuild -p ios --no-install

# package.json may have gained a new native module while ios/ already existed.
# Without pod install Xcode keeps building a stale set of Expo modules.
echo "▶︎ Synchronizing CocoaPods…"
npx pod-install ios

# Take the native project name from the prebuild result, not the old app name.
PROJECTS=(ios/*.xcodeproj)
if [ "${#PROJECTS[@]}" -ne 1 ] || [ ! -d "${PROJECTS[0]}" ]; then
  echo "Expected exactly one generated iOS project." >&2
  exit 1
fi
NATIVE_PROJECT="$(basename "${PROJECTS[0]}" .xcodeproj)"
WS="ios/$NATIVE_PROJECT.xcworkspace"
APP="$BUILD_DIR/Build/Products/Release-iphoneos/$NATIVE_PROJECT.app"

# --- detect the phone --------------------------------------------------------------------
# xcdevice reports modelCode, so an iPad cannot slip into the selection
# even if the owner renamed the iPhone.
DEVICE="${DEVICE:-}"
if [ -z "$DEVICE" ]; then
  DEVICE=$(xcrun xcdevice list 2>/dev/null | node -e '
    let input = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => { input += chunk; });
    process.stdin.on("end", () => {
      const device = JSON.parse(input).find((candidate) =>
        candidate.simulator === false &&
        candidate.available === true &&
        candidate.platform === "com.apple.platform.iphoneos" &&
        candidate.modelCode?.startsWith("iPhone")
      );
      if (device) process.stdout.write(device.identifier);
    });
  ')
fi
if [ -z "$DEVICE" ]; then
  echo "✗ No connected iPhone found. Connect it by cable, unlock it, and trust this computer." >&2
  echo "  List devices: xcrun xctrace list devices" >&2
  exit 1
fi
echo "▶︎ Device: $DEVICE"

# PCM files store an absolute path. After the repository is moved, Xcode cannot
# import SwiftShims until the stale module cache is removed.
if [ -d "$MODULE_CACHE" ]; then
  PCM_SAMPLE=$(find "$MODULE_CACHE" -type f -name '*.pcm' -print -quit)
  if [ -n "$PCM_SAMPLE" ] && ! strings "$PCM_SAMPLE" | grep -F "$MODULE_CACHE/" >/dev/null; then
    echo "▶︎ Clearing the module cache from the previous project path…"
    find "$MODULE_CACHE" -depth -delete
  fi
fi

# prebuild sometimes resets DEVELOPMENT_TEAM — force the correct one
if [ -f "ios/$NATIVE_PROJECT.xcodeproj/project.pbxproj" ]; then
  sed -i '' "s/DEVELOPMENT_TEAM = \"[A-Z0-9]*\"/DEVELOPMENT_TEAM = \"$TEAM\"/g" \
    "ios/$NATIVE_PROJECT.xcodeproj/project.pbxproj"
fi

# --- build + install --------------------------------------------------------------------
echo "▶︎ Building Release…"
xcrun xcodebuild -workspace "$WS" -scheme "$NATIVE_PROJECT" \
  -configuration Release -destination "id=$DEVICE" \
  -allowProvisioningUpdates -derivedDataPath "$BUILD_DIR" \
  DEVELOPMENT_TEAM="$TEAM" CODE_SIGN_STYLE=Automatic build

echo "▶︎ Installing on iPhone…"
xcrun devicectl device install app --device "$DEVICE" "$APP"

echo "▶︎ Launching…"
xcrun devicectl device process launch --device "$DEVICE" "$BUNDLE" || true

echo "✔ Done."
