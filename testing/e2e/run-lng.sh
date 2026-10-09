#!/bin/bash
# Прогон LNG-флоу языка интерфейса (LNG-001…009).
#
# Maestro не умеет менять системный язык iOS, поэтому локаль симулятора
# переключает этот раннер между флоу: defaults write -g AppleLocale /
# AppleLanguages + перезагрузка устройства (cfprefsd кеширует домен, иначе
# приложение не увидит новую локаль).
#
# Порядок и локали — по предусловиям в шапках самих флоу:
#   en_US: lng-001        ru_RU: lng-002        uk_UA: lng-003
#   de_DE: lng-004        ru_RU: lng-005        en_US: lng-006
#   de_DE: lng-007 (без clearState, читает контейнер после lng-006!)
#   en_US: lng-008        ru_RU: lng-009
# После прогона, в том числе упавшего, симулятор возвращается на ru_RU —
# рабочую локаль остального сьюта. Язык интерфейса приложения возвращает на
# русский только успешный прогон (ios-lng-restore-ru.yaml).
#
# Устройство: UDID=<udid>, по умолчанию симулятор «Pray Smoke iPhone 17 Pro»;
# выключенный симулятор скрипт загружает сам.
set -euo pipefail
cd "$(dirname "$0")/../.."

export MAESTRO_DRIVER_STARTUP_TIMEOUT=180000

UDID="${UDID:-$(testing/e2e/sim-udid.sh "Pray Smoke iPhone 17 Pro")}"
# defaults write через simctl spawn работает только на загруженном устройстве.
xcrun simctl bootstatus "$UDID" -b

# Шаги связаны через &&: функция возвращает первую ошибку и тогда, когда её
# вызывают слева от || (там errexit не действует).
set_locale() { # $1 = locale (en_US), $2 = language (en)
  echo "== Локаль симулятора -> $1 ($2)" &&
    xcrun simctl spawn "$UDID" defaults write -g AppleLocale -string "$1" &&
    xcrun simctl spawn "$UDID" defaults write -g AppleLanguages -array "$2" &&
    xcrun simctl shutdown "$UDID" &&
    xcrun simctl boot "$UDID" &&
    xcrun simctl bootstatus "$UDID" -b
}

run() { # $1 = flow
  echo "== maestro: $1"
  maestro --device "$UDID" test --test-output-dir "${TMPDIR:-/tmp/}pray-e2e-output" "testing/e2e/$1"
}

step() { # $1 = locale, $2 = language, $3 = flow
  set_locale "$1" "$2"
  run "$3"
}

# Упавший флоу останавливает прогон; симулятор всё равно возвращается на
# ru_RU, а код выхода остаётся ненулевым.
restore_locale_on_failure() {
  local status=$?
  if [ "$status" != 0 ]; then
    set_locale ru_RU ru || echo "FAIL: simulator locale was not restored to ru_RU" >&2
  fi
  exit "$status"
}
trap restore_locale_on_failure EXIT

step en_US en ios-lng-001-clean-en.yaml
step ru_RU ru ios-lng-002-clean-ru.yaml
step uk_UA uk ios-lng-003-clean-uk.yaml
step de_DE de ios-lng-004-unsupported-locale.yaml
step ru_RU ru ios-lng-005-switch-no-restart.yaml
step en_US en ios-lng-006-persist-relaunch.yaml
# lng-007 идёт строго после lng-006 и без чистой установки.
step de_DE de ios-lng-007-choice-survives-locale.yaml
step en_US en ios-lng-008-independent-of-scripture.yaml
step ru_RU ru ios-lng-009-fallback-questions.yaml

set_locale ru_RU ru
run ios-lng-restore-ru.yaml

echo "== Все LNG-флоу зелёные"
