#!/bin/bash
# Прогон LOCK-009/010 (биометрия).
#
# По умолчанию прогон идёт на Pray SE с Touch ID. Управление симулятором
# BiometricKit (notifyutil):
#   enrollment — состояние com.apple.BiometricKit.enrollmentChanged (0/1)
#   совпадение — com.apple.BiometricKit_Sim.fingerTouch.match
#   отказ      — com.apple.BiometricKit_Sim.fingerTouch.nomatch
# Maestro не умеет слать эти сигналы из флоу: флоу засыпает на evalScript-sleep,
# скрипт в это время постит сигнал.
#
# Окружение: UDID (по умолчанию симулятор «Pray SE»), SIG
# (по умолчанию fingerTouch; на устройстве с Face ID — pearl).
# По умолчанию доказательства идут во временную папку (не в репозиторий).
# Для сохранения в отчёт передайте EVIDENCE_DIR=testing/evidence/<дата>-<тема>.
set -euo pipefail
cd "$(dirname "$0")/../.."

export MAESTRO_DRIVER_STARTUP_TIMEOUT=180000
EVIDENCE="${EVIDENCE_DIR:-${TMPDIR:-/tmp/}pray-e2e-output}"
mkdir -p "$EVIDENCE"
UDID="${UDID:-$(testing/e2e/sim-udid.sh "Pray SE")}"
SIG="${SIG:-fingerTouch}"
DEV=(--device "$UDID")
BIO="com.apple.BiometricKit_Sim.$SIG"

signal() { xcrun simctl spawn "$UDID" notifyutil -p "$1"; }

# Явное состояние регистрации вместо устаревшего сигнала-переключателя.
set_enrolled() {
  xcrun simctl spawn "$UDID" notifyutil -s com.apple.BiometricKit.enrollmentChanged "$1"
  xcrun simctl spawn "$UDID" notifyutil -p com.apple.BiometricKit.enrollmentChanged
}

# Любой выход из скрипта, в том числе по Ctrl-C, сначала останавливает фоновый
# Maestro (в неинтерактивном bash он не получает SIGINT и иначе продолжит
# управлять устройством параллельно с уборкой). Затем, пока пин включён
# (после подготовки и до успешного 010), tracked-флоу уборки снимает его:
# иначе упавший 009a…010 оставляет симулятор с тестовым пином. Без образца
# биометрии приложение сразу показывает пин-клавиатуру (как в LOCK-010),
# поэтому уборка сначала снимает регистрацию. Код выхода прогона сохраняется.
PIN_MAY_BE_ON=0
WORKER=
cleanup_pin() {
  local status=$?
  if [ -n "$WORKER" ] && kill -0 "$WORKER" 2>/dev/null; then
    kill "$WORKER"
    wait "$WORKER" || true
  fi
  if [ "$PIN_MAY_BE_ON" = 1 ]; then
    local log="$EVIDENCE/ios-lock-cleanup.log"
    echo "== Уборка: снимаем тестовый пин" >&2
    if ! { set_enrolled 0 && maestro test "${DEV[@]}" --test-output-dir "$EVIDENCE" testing/e2e/ios-lock-cleanup.yaml > "$log" 2>&1; }; then
      echo "FAIL: PIN cleanup flow failed (if LOCK-010 got past disabling the PIN, it is already off), see $log" >&2
      [ "$status" = 0 ] && status=1
    fi
  fi
  exit "$status"
}
trap cleanup_pin EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

set_enrolled 1

echo "== Подготовка: включаем пин 123456"
PREPARE_LOG="$EVIDENCE/ios-lock-011-prepare.log"
# Подготовка включает пин последним шагом и проверяет это: при её падении пин
# не включён (или был включён до прогона, вопреки предусловию), уборка не нужна.
maestro test "${DEV[@]}" --test-output-dir "$EVIDENCE" testing/e2e/ios-lock-011-prepare.yaml > "$PREPARE_LOG" 2>&1 || { echo "FAIL: PIN preparation, see $PREPARE_LOG" >&2; exit 1; }
PIN_MAY_BE_ON=1

# Экран настроек опрашивает биометрию при монтировании: tracked-флоу заново
# открывает настройки и прокручивает их до раздела защиты.
NAV_LOG="$EVIDENCE/ios-lock-biometrics-settings.log"
maestro test "${DEV[@]}" --test-output-dir "$EVIDENCE" testing/e2e/ios-lock-biometrics-settings.yaml > "$NAV_LOG" 2>&1 || { echo "FAIL: opening biometric settings, see $NAV_LOG" >&2; exit 1; }
maestro "${DEV[@]}" hierarchy > "$EVIDENCE/biometrics-hierarchy.json"
if ! grep -q 'biometrics-toggle' "$EVIDENCE/biometrics-hierarchy.json"; then
  echo "FAIL: enrolled biometrics are absent from the visible protection section" >&2
  exit 1
fi
echo "   биометрия доступна"

# Сигнал посылается после подтверждённого системного диалога: флоу
# входит в специальную паузу, которую видно в полном командном логе.
# Маркер — точный текст этой паузы в выводе Maestro. Шаг
# `evalScript: "java.lang.Thread.sleep(20000)"` стоит в
# ios-lock-009a-enable-biometrics.yaml, ios-lock-009b-cold-start-faceid.yaml и
# ios-lock-009c-refusal.yaml: длительность меняется во всех трёх флоу и здесь.
BIO_WAIT_MARKER='Run java.lang.Thread.sleep(20000)'
run_biometric_flow() {
  local name="$1" result_signal="$2"
  local log="$EVIDENCE/$name.log"
  : > "$log"
  maestro test "${DEV[@]}" --test-output-dir "$EVIDENCE" "testing/e2e/$name.yaml" > "$log" 2>&1 &
  WORKER=$!
  local ready=0
  for ((attempt=0; attempt<240; attempt++)); do
    if grep -Fq "$BIO_WAIT_MARKER" "$log"; then
      ready=1
      break
    fi
    if ! kill -0 "$WORKER" 2>/dev/null; then
      wait "$WORKER" || true
      WORKER=
      echo "FAIL: flow exited before its authentication wait: $log" >&2
      return 1
    fi
    sleep 1
  done
  if [ "$ready" != 1 ]; then
    # Зависший флоу останавливает EXIT-ловушка.
    echo "FAIL: authentication wait timed out: $log" >&2
    return 1
  fi
  echo "Authentication ready: $name"
  signal "$BIO.$result_signal"
  local status=0
  wait "$WORKER" || status=$?
  WORKER=
  if [ "$status" != 0 ]; then
    echo "FAIL: $name, see $log" >&2
    return 1
  fi
}

echo "== LOCK-009a: включение биометрии"
run_biometric_flow ios-lock-009a-enable-biometrics match

echo "== LOCK-009b: холодный старт, вход по биометрии"
run_biometric_flow ios-lock-009b-cold-start-faceid match

echo "== LOCK-009c: отказ, запасной вход пином"
run_biometric_flow ios-lock-009c-refusal nomatch

echo "== LOCK-010: образцы удалены, вход пином"
set_enrolled 0
LOCK_010_LOG="$EVIDENCE/ios-lock-010-biometrics-removed.log"
maestro test "${DEV[@]}" --test-output-dir "$EVIDENCE" testing/e2e/ios-lock-010-biometrics-removed.yaml > "$LOCK_010_LOG" 2>&1 || { echo "FAIL: LOCK-010, see $LOCK_010_LOG" >&2; exit 1; }
# 010 выключает пин вместе с биометрией: уборка больше не нужна, а enrollment
# возвращать не требуется.
PIN_MAY_BE_ON=0

echo "== Готово. Доказательства: $EVIDENCE"
