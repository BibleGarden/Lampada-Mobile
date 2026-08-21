#!/usr/bin/env bash
# Сборка Release + установка Лампады на подключённый iPhone.
# Использование: npm run iphone
#   Переопределяемо через окружение:
#     DEVICE=<udid>   — конкретное устройство (по умолчанию — первый подключённый iPhone)
#     TEAM=<teamId>   — команда подписи (по умолчанию платная Maria Novikov)
set -euo pipefail

cd "$(dirname "$0")/.."

TEAM="${TEAM:-4SC2JCE37N}"                 # Maria Novikov (платная)
BUNDLE="${BUNDLE:-com.marianovikov.lampada}"
WS="ios/Lampada.xcworkspace"
APP="ios/build/Build/Products/Release-iphoneos/Lampada.app"

# --- нативная папка ------------------------------------------------------
if [ ! -d ios ]; then
  echo "▶︎ ios/ отсутствует — генерирую (expo prebuild)…"
  npx expo prebuild -p ios
fi

# package.json мог получить новый native-модуль при уже существующей ios/.
# Без pod install Xcode продолжит собирать устаревший набор Expo-модулей.
echo "▶︎ Синхронизирую CocoaPods…"
npx pod-install ios

# --- определяем телефон -------------------------------------------------
# Спрашиваем у самого xcodebuild реально доступные для сборки устройства
# и берём физический iOS-девайс (не Mac, не симулятор, не placeholder).
DEVICE="${DEVICE:-}"
if [ -z "$DEVICE" ]; then
  DEVICE=$(xcrun xcodebuild -workspace "$WS" -scheme Lampada -showdestinations 2>/dev/null \
    | grep 'platform:iOS,' | grep -v placeholder \
    | grep -Eo 'id:[0-9A-Fa-f-]+' | head -1 | cut -d: -f2-)
fi
if [ -z "$DEVICE" ]; then
  echo "✗ Не нашёл подключённый iPhone. Подключи кабелем, разблокируй, доверься компьютеру." >&2
  echo "  Список устройств: xcrun xctrace list devices" >&2
  exit 1
fi
echo "▶︎ Устройство: $DEVICE"

# prebuild иногда сбрасывает DEVELOPMENT_TEAM — принудительно ставим нужную
if [ -f ios/Lampada.xcodeproj/project.pbxproj ]; then
  sed -i '' "s/DEVELOPMENT_TEAM = \"[A-Z0-9]*\"/DEVELOPMENT_TEAM = \"$TEAM\"/g" \
    ios/Lampada.xcodeproj/project.pbxproj
fi

# --- сборка + установка --------------------------------------------------
echo "▶︎ Сборка Release…"
xcrun xcodebuild -workspace "$WS" -scheme Lampada \
  -configuration Release -destination "id=$DEVICE" \
  -allowProvisioningUpdates -derivedDataPath ios/build \
  DEVELOPMENT_TEAM="$TEAM" CODE_SIGN_STYLE=Automatic build

echo "▶︎ Установка на iPhone…"
xcrun devicectl device install app --device "$DEVICE" "$APP"

echo "▶︎ Запуск…"
xcrun devicectl device process launch --device "$DEVICE" "$BUNDLE" || true

echo "✔ Готово."
