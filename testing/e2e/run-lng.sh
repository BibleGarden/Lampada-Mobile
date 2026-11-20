#!/bin/bash
# Runs the UI-language LNG flows (LNG-001…009).
#
# Maestro cannot change the iOS system language, so this runner switches the
# simulator locale between flows: defaults write -g AppleLocale /
# AppleLanguages + device reboot (cfprefsd caches the domain, otherwise the
# app will not see the new locale).
# LNG flows declare permissions explicitly (notifications and microphone): the
# default Maestro permissions (all: allow) request geolocation via simctl privacy,
# and locationd can hang right after a cold boot, making launchApp hang too.
#
# Order and locales follow the preconditions in the flow headers themselves:
#   en_US: lng-001        ru_RU: lng-002        uk_UA: lng-003
#   de_DE: lng-004        ru_RU: lng-005        en_US: lng-006
#   de_DE: lng-007 (no clearState, reads the container after lng-006!)
#   en_US: lng-008        ru_RU: lng-009
# After the run, even a failed one, the simulator returns to ru_RU —
# the working locale of the rest of the suite. Only a successful run restores
# the app's UI language to Russian (ios-lng-restore-ru.yaml).
#
# Device: UDID=<udid>, default simulator "Pray Smoke iPhone 17 Pro";
# the script boots a shut-down simulator by itself.
set -euo pipefail
cd "$(dirname "$0")/../.."

export MAESTRO_DRIVER_STARTUP_TIMEOUT=180000

UDID="${UDID:-$(testing/e2e/sim-udid.sh "Pray Smoke iPhone 17 Pro")}"
# defaults write via simctl spawn only works on a booted device.
xcrun simctl bootstatus "$UDID" -b

# Steps are chained with &&: the function must surface the first error even
# when called to the left of || (where errexit does not apply).
set_locale() { # $1 = locale (en_US), $2 = language (en)
  echo "== Simulator locale -> $1 ($2)" &&
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

# A failed flow stops the run; the simulator is still restored to ru_RU,
# and the exit code stays non-zero.
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
# lng-007 runs strictly after lng-006 and without a clean install.
step de_DE de ios-lng-007-choice-survives-locale.yaml
step en_US en ios-lng-008-independent-of-scripture.yaml
step ru_RU ru ios-lng-009-fallback-questions.yaml

set_locale ru_RU ru
run ios-lng-restore-ru.yaml

echo "== All LNG flows green"
