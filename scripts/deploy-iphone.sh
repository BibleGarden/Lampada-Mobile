#!/usr/bin/env bash
# Сборка Release + установка Lampada на подключённый iPhone.
# Использование: npm run iphone
#   Переопределяемо через окружение:
#     DEVICE=<udid>   — конкретное устройство (по умолчанию — первый подключённый iPhone)
#     TEAM=<teamId>   — команда подписи (по умолчанию платная Maria Novikov)
set -euo pipefail

cd "$(dirname "$0")/.."

TEAM="${TEAM:-4SC2JCE37N}"                 # Maria Novikov (платная)
BUNDLE="${BUNDLE:-twinkler}"
BUILD_DIR="$(pwd -P)/ios/build"
MODULE_CACHE="$BUILD_DIR/ModuleCache.noindex"

echo "▶︎ Checking runtime variables for the local Release build…"
bash scripts/check-runtime-env.sh local

# --- нативная папка ------------------------------------------------------
# Синхронизируем конфигурацию и переводы разрешений даже при существующей ios/.
echo "▶︎ Synchronizing native iOS configuration…"
npx expo prebuild -p ios --no-install

# package.json мог получить новый native-модуль при уже существующей ios/.
# Без pod install Xcode продолжит собирать устаревший набор Expo-модулей.
echo "▶︎ Synchronizing CocoaPods…"
npx pod-install ios

# Имя нативного проекта берём из результата prebuild, а не старого имени приложения.
PROJECTS=(ios/*.xcodeproj)
if [ "${#PROJECTS[@]}" -ne 1 ] || [ ! -d "${PROJECTS[0]}" ]; then
  echo "Expected exactly one generated iOS project." >&2
  exit 1
fi
NATIVE_PROJECT="$(basename "${PROJECTS[0]}" .xcodeproj)"
WS="ios/$NATIVE_PROJECT.xcworkspace"
APP="$BUILD_DIR/Build/Products/Release-iphoneos/$NATIVE_PROJECT.app"

# --- определяем телефон -------------------------------------------------
# xcdevice отдаёт modelCode, поэтому iPad не попадёт под выбор,
# даже если владелец переименовал iPhone.
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

# PCM хранит абсолютный путь. После переноса репозитория Xcode не
# может импортировать SwiftShims, пока старый module cache не удалён.
if [ -d "$MODULE_CACHE" ]; then
  PCM_SAMPLE=$(find "$MODULE_CACHE" -type f -name '*.pcm' -print -quit)
  if [ -n "$PCM_SAMPLE" ] && ! strings "$PCM_SAMPLE" | grep -F "$MODULE_CACHE/" >/dev/null; then
    echo "▶︎ Clearing the module cache from the previous project path…"
    find "$MODULE_CACHE" -depth -delete
  fi
fi

# prebuild иногда сбрасывает DEVELOPMENT_TEAM — принудительно ставим нужную
if [ -f "ios/$NATIVE_PROJECT.xcodeproj/project.pbxproj" ]; then
  sed -i '' "s/DEVELOPMENT_TEAM = \"[A-Z0-9]*\"/DEVELOPMENT_TEAM = \"$TEAM\"/g" \
    "ios/$NATIVE_PROJECT.xcodeproj/project.pbxproj"
fi

# --- сборка + установка --------------------------------------------------
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
