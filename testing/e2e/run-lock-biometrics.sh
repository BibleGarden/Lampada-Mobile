#!/bin/bash
# Прогон LOCK-009/010 (биометрия).
#
# Face ID в iOS Simulator недоступен в принципе (ограничение Apple), поэтому
# прогон идёт на iPhone SE (3rd generation) с Touch ID. Управление сигналами
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
      id: lock-toggle
    direction: DOWN
EOF
maestro test "${DEV[@]}" --test-output-dir "$EVIDENCE" /tmp/bio-nav.yaml
maestro hierarchy "${DEV[@]}" > "$EVIDENCE/biometrics-hierarchy.json"
if ! grep -q 'biometrics-toggle' "$EVIDENCE/biometrics-hierarchy.json"; then
  echo "FAIL: enrolled biometrics are absent from the visible protection section" >&2
  exit 1
fi
echo "   биометрия доступна"

echo "== LOCK-009a: включение биометрии"
maestro test "${DEV[@]}" --test-output-dir "$EVIDENCE" testing/e2e/ios-lock-009a-enable-biometrics.yaml > /tmp/lock-009a.log 2>&1 &
M=$!
sleep 30
signal "$BIO.match"
wait $M || { echo "LOCK-009a FAILED, см. /tmp/lock-009a.log"; exit 1; }

echo "== LOCK-009b: холодный старт, вход по биометрии"
maestro test "${DEV[@]}" --test-output-dir "$EVIDENCE" testing/e2e/ios-lock-009b-cold-start-faceid.yaml > /tmp/lock-009b.log 2>&1 &
M=$!
sleep 30
signal "$BIO.match"
wait $M || { echo "LOCK-009b FAILED, см. /tmp/lock-009b.log"; exit 1; }

echo "== LOCK-009c: отказ, запасной вход пином"
maestro test "${DEV[@]}" --test-output-dir "$EVIDENCE" testing/e2e/ios-lock-009c-refusal.yaml > /tmp/lock-009c.log 2>&1 &
M=$!
sleep 30
signal "$BIO.nomatch"
wait $M || { echo "LOCK-009c FAILED, см. /tmp/lock-009c.log"; exit 1; }

echo "== LOCK-010: образцы удалены, вход пином"
set_enrolled 0
maestro test "${DEV[@]}" --test-output-dir "$EVIDENCE" testing/e2e/ios-lock-010-biometrics-removed.yaml > /tmp/lock-010.log 2>&1
echo "LOCK-010 exit=$?"

# Enrollment возвращать не нужно: тумблер биометрии выключен вместе с пином
# в конце 010.
echo "== Готово. Доказательства: $EVIDENCE"
