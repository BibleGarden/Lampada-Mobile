# Non-blocking prayer timer expiry

Date: 2026-09-13. Installed version: 1.0.15.

## Behavior

Expiry shows a non-interactive six-second notice above the prayer and its sheets.
The timer stays at zero with a continuation hint. Reading, answers, narration
and music continue until the user explicitly finishes the prayer. Returning
from the background presents an unseen notice; extending the timer resets it.
Saving an answer no longer implies finishing the prayer.

Automatic completion scheduling and its obsolete tests were removed. The finite
timer, music expiry and background resume Maestro flows now expect explicit
completion. The architecture overview and SES-001, MUS-006/007, ANS-010 and
SCR-016/017/018 scenarios describe the new behavior.

## Verification

- Full Node suite: 191 tests passed, exit 0. Command:
  `node --experimental-strip-types --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test --test-reporter=dot lib/__tests__/*.test.mjs`.
- `npm run typecheck`: exit 0, no diagnostics.
- The finite timer Maestro flow did not reach the prayer. XCTest failed while
  fetching the initial accessibility hierarchy with `kAXErrorInvalidUIElement`.
  The runner hung after the exception and was terminated, exit 143. It was not
  retried. The simulator Home screen was rendered in English while this existing
  flow uses Russian labels. Evidence:
  [driver failure](../evidence/2026-09-13-expiry-notice/maestro-driver-failure.log).
- `npm run iphone`, with `DEVICE` explicitly selecting the physical iPad Pro
  11-inch (M4), built and installed standalone Release 1.0.15, exit 0. Runtime
  preflight passed; both required runtime values were found in the embedded
  bundle without printing their contents. Xcode emitted dependency and bundler
  warnings and reported `BUILD SUCCEEDED`.
- `devicectl device info apps` confirmed installed version 1.0.15;
  `devicectl device info processes` confirmed the main Lampada process running.
- Notice layout and reading/listening through expiry still require device UI
  verification; installation and launch do not establish those results.
