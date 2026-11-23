#!/usr/bin/env bash
# Puts the emulator's status bar into SystemUI demo mode with fixed content, so
# the "before" and "after" screenshots have the same clock, battery and network
# icons. SystemUI may drop a broadcast while it is still settling, so the
# scripts call this again before every flow.
#
# Usage: android-status-bar.sh <serial>
set -euo pipefail
serial="${1:?serial}"
broadcast() { adb -s "$serial" shell am broadcast -a com.android.systemui.demo -e command "$@" >/dev/null; }
adb -s "$serial" shell settings put global sysui_demo_allowed 1
broadcast enter
broadcast clock -e hhmm 0941
broadcast battery -e level 100 -e plugged false -e powersave false
broadcast network -e wifi show -e level 4 -e fully true
broadcast network -e mobile hide
broadcast network -e airplane hide
broadcast notifications -e visible false
sleep 2
