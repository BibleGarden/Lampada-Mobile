#!/bin/bash
# LOCK-008: снимок приложения в переключателе задач показывает шторку
# приватности, а не контент.
#
# Часть 1 (Maestro, ios-lock-008-appswitcher.yaml): включает пин 123456,
# открывает дневник и уводит приложение в фон.
# Часть 2 (здесь): открывает App Switcher и фиксирует снимок.
#   Переключатель открывается через меню Simulator (Device → App Switcher):
#   требуется доступность (System Events → Simulator). Если AppleScript
#   заблокирован — пункт помечается гибридным: откройте переключатель
#   вручную (свайп вверх с задержкой) и сделайте снимок командой ниже.
# По умолчанию доказательства идут во временную папку (не в репозиторий).
# Для сохранения в отчёт передайте EVIDENCE_DIR=testing/evidence/<дата>-<тема>.
set -euo pipefail
cd "$(dirname "$0")/../.."
export MAESTRO_DRIVER_STARTUPTIMEOUT=180000
EVIDENCE="${EVIDENCE_DIR:-${TMPDIR:-/tmp/}pray-e2e-output}"
mkdir -p "$EVIDENCE"
UDID=05F697B7-36CD-4050-9D57-FC9316AA093C

maestro test --device "$UDID" --test-output-dir "$EVIDENCE" testing/e2e/ios-lock-008-appswitcher.yaml

echo "== Открываем App Switcher через меню Simulator"
if osascript -e 'tell application "System Events" to tell process "Simulator" to click menu item "App Switcher" of menu 1 of menu bar item "Device" of menu bar 1' 2>/dev/null; then
  sleep 2
  xcrun simctl io "$UDID" screenshot "$EVIDENCE/LOCK-008-app-switcher.png" > /dev/null
  echo "Снимок: $EVIDENCE/LOCK-008-app-switcher.png"
else
  echo "AppleScript недоступен — откройте переключатель вручную и выполните:"
  echo "  xcrun simctl io $UDID screenshot $EVIDENCE/LOCK-008-app-switcher.png"
fi

# Разбор защиты: приложение разблокировано пином после возврата, затем пин снят.
xcrun simctl spawn "$UDID" notifyutil -p com.apple.springboard.home 2>/dev/null || true
maestro test --device "$UDID" --test-output-dir "$EVIDENCE" /tmp/disable-pin.yaml || true
echo "== Готово"
