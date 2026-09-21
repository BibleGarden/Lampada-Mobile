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
# После прогона симулятор возвращается на ru_RU — рабочую локаль остального
# сьюта.
#
# Устройство: UDID=<udid> или берётся booted-симулятор.
set -euo pipefail
cd "$(dirname "$0")/../.."

export MAESTRO_DRIVER_STARTUPTIMEOUT=180000

UDID="${UDID:-$(xcrun simctl list devices booted -j | python3 -c 'import json,sys; d=json.load(sys.stdin)["devices"]; print([x["udid"] for k in d for x in d[k] if x["state"]=="Booted"][0])')}"

set_locale() { # $1 = locale (en_US), $2 = language (en)
  echo "== Локаль симулятора -> $1 ($2)"
  xcrun simctl shutdown "$UDID" >/dev/null 2>&1 || true
  xcrun simctl spawn "$UDID" defaults write -g AppleLocale -string "$1" || true
  xcrun simctl spawn "$UDID" defaults write -g AppleLanguages -array "$2" || true
  xcrun simctl shutdown "$UDID" >/dev/null 2>&1 || true
  xcrun simctl bootstatus "$UDID" -b >/dev/null 2>&1
}

run() { # $1 = flow
  echo "== maestro: $1"
  maestro test "testing/e2e/$1"
}

FAILED=0
step() { # $1 = locale, $2 = language, $3 = flow
  set_locale "$1" "$2"
  run "$3" || FAILED=1
}

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

if [ "$FAILED" != "0" ]; then
  echo "!! Есть упавшие LNG-флоу"
  exit 1
fi
echo "== Все LNG-флоу зелёные"
