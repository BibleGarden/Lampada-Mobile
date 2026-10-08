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
set_enrolled 1

echo "== Подготовка: включаем пин 123456"
maestro test "${DEV[@]}" --test-output-dir "$EVIDENCE" testing/e2e/ios-lock-011-prepare.yaml > /tmp/lock-bio-prepare.log 2>&1 || { echo "FAIL: подготовка пина"; exit 1; }

# Экран настроек опрашивает
# биометрию при монтировании: возвращаемся home и открываем настройки заново
# через Maestro openLink (simctl openurl показывает системный диалог «Open in
# Lampada?» — поэтому только openLink). Возможный диалог «Open» снимаем.
cat > /tmp/bio-nav.yaml <<'EOF'
appId: twinkler
---
- openLink: "lampada://"
- tapOn:
    text: "Open|Открыть"
    optional: true
- waitForAnimationToEnd:
    timeout: 2000
- openLink: "lampada://settings"
- tapOn:
    text: "Open|Открыть"
    optional: true
- waitForAnimationToEnd:
    timeout: 3000
- scrollUntilVisible:
    element:
      id: biometrics-toggle
    direction: DOWN
EOF
maestro test "${DEV[@]}" --test-output-dir "$EVIDENCE" /tmp/bio-nav.yaml
maestro "${DEV[@]}" hierarchy > "$EVIDENCE/biometrics-hierarchy.json"
if ! grep -q 'biometrics-toggle' "$EVIDENCE/biometrics-hierarchy.json"; then
  echo "FAIL: enrolled biometrics are absent from the visible protection section" >&2
  exit 1
fi
echo "   биометрия доступна"

# Сигнал посылается после подтверждённого системного диалога: флоу
# входит в специальную паузу, которую видно в полном командном логе.
run_biometric_flow() {
  local name="$1" result_signal="$2"
  local log="$EVIDENCE/$name.log"
  : > "$log"
  maestro test "${DEV[@]}" --test-output-dir "$EVIDENCE" "testing/e2e/$name.yaml" > "$log" 2>&1 &
  local worker=$!
  local ready=0
  for ((attempt=0; attempt<240; attempt++)); do
    if grep -Fq 'Run java.lang.Thread.sleep(20000)' "$log"; then
      ready=1
      break
    fi
    if ! kill -0 "$worker" 2>/dev/null; then
      wait "$worker"
      echo "FAIL: flow exited before its authentication wait: $log" >&2
      return 1
    fi
    sleep 1
  done
  if [ "$ready" != 1 ]; then
    echo "FAIL: authentication wait timed out: $log" >&2
    kill "$worker"
    wait "$worker"
    return 1
  fi
  echo "Authentication ready: $name"
  signal "$BIO.$result_signal"
  wait "$worker"
}

echo "== LOCK-009a: включение биометрии"
run_biometric_flow ios-lock-009a-enable-biometrics match

echo "== LOCK-009b: холодный старт, вход по биометрии"
run_biometric_flow ios-lock-009b-cold-start-faceid match

echo "== LOCK-009c: отказ, запасной вход пином"
run_biometric_flow ios-lock-009c-refusal nomatch

echo "== LOCK-010: образцы удалены, вход пином"
set_enrolled 0
maestro test "${DEV[@]}" --test-output-dir "$EVIDENCE" testing/e2e/ios-lock-010-biometrics-removed.yaml > /tmp/lock-010.log 2>&1
echo "LOCK-010 exit=$?"

# Enrollment возвращать не нужно: тумблер биометрии выключен вместе с пином
# в конце 010.
echo "== Готово. Доказательства: $EVIDENCE"
