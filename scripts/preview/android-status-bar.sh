#!/usr/bin/env bash
# Puts the emulator's status bar into SystemUI demo mode with fixed content, so
# the "before" and "after" screenshots have the same clock and battery and no
# network icons. SystemUI may drop a broadcast while it is still settling, so the
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
# Network icons are hidden: the same commands left a different set of icons in
# two emulators of one run, and the icons say nothing about the app.
broadcast network -e wifi hide
broadcast network -e mobile hide
broadcast network -e airplane hide
broadcast notifications -e visible false
sleep 2
