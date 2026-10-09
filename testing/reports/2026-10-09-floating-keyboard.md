# Floating keyboard layout verification — 2026-10-09

Application source: `aabc5b4`; subsequent commits only reserve versions or update documentation.
Android Release **1.3.28**: physical Samsung Galaxy Z Fold5 SM-F946B, Android API 34, and `Pray_Pixel_API_35` emulator.
iOS Release **1.3.29**: `Pray Smoke iPhone 17 Pro` and `Pray iPad2` simulators.

## Repair

Samsung's floating keyboard reports an IME inset equal to the system navigation
bar. React Native consequently sends occupied height zero and the window's bottom
as `screenY`. Setup previously treated that as a docked keyboard edge and stretched
the goal input beneath the floating panel. `useKeyboardTop` now reserves space only
for frames with positive occupied height. Setup and Reflection retain their normal
layout for this zero-height floating frame; docked-keyboard behavior remains unchanged.

## Validation

| Check | Result |
| --- | --- |
| TypeScript | exit 0 |
| Unit suite | 334 tests, exit 0 |
| Android critical gate | 10/10, exit 0 after documented System UI recovery |
| Android docked-keyboard scenarios | Long goal, takeaway and reflection/journal: 3/3, exit 0 |
| Physical Fold5 floating-keyboard flow | exit 0; retains normal input bounds and typed goal |
| iOS critical gate | 10/10, exit 0 after documented XCTest-driver recovery |
| iPhone keyboard scenarios | Long goal and takeaway: 2/2, exit 0 |
| iPad keyboard/rotation scenarios | Setup margins and takeaway rotation: 2/2, exit 0 |

The physical-phone flow does not clear app data. Manual checks covered the folded
and unfolded displays, docked/split and floating keyboards, switching modes and
preserving text. The original Samsung keyboard modes were restored; only the test
goal was removed. The owner's requested stay-awake-while-plugged-in setting remains
enabled. Android API 34 retains the app's declared portrait orientation when device
rotation is requested; this is not an Android landscape acceptance claim.

## Infrastructure results

The initial Android critical attempt stopped on a System UI ANR dialog covering
Home. The failure screenshot names System UI, not Lampada. After dismissing that
system dialog, the unchanged binary completed the critical gate.

The iOS build produced a signed Release app (`Build Succeeded`, zero compile errors)
and installed it, but the composite Expo command exited 1 when its development-client
URL launch timed out (NSPOSIXErrorDomain 60). The first Maestro attempt also exited 1
before any flow: SpringBoard reported the installed Maestro XCTest runner as
`NotFound`. After restarting the same named simulator, native app launch exited 0
and the unchanged binary was tested. These infrastructure retries were authorized
by the owner. No Lampada crash was observed in the phone crash buffer or host
DiagnosticReports during these checks.

## Evidence

All files in `../evidence/2026-10-09-floating-keyboard/` belong to this report:
`screenshots/fold-*.png` show the original and repaired physical layouts; `build-identities.json`
identifies the binaries; logs and `.exit` files record final checks and the decisive
infrastructure failures. Complete build, system, command and Maestro logs remain
in `/tmp/pray-android-2026-10-09/`, including the failed commands and original exits.

This is a keyboard regression check. The entire main, rare and ordered tiers were
not replayed; their previous release acceptance is documented in
`2026-10-08-android-ios.md`. No CI result is claimed.
