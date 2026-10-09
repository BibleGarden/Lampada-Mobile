# Remove the unsolicited Finish typing action — 2026-10-09

The owner requested restoring the existing interface. Removed the added action
from setup, answers, reflection, reports and journal, its component, locale keys,
and unused form-policy property. Existing Done/Enter submission and outside-tap
dismissal remain unchanged. The native contracts now require the added action
to be absent and use existing sheet handles, titles and report backdrops.

Application source: `57dadfd`. Android Release: **1.3.41**, installed on the
owner's phone with `adb install -r` (exit 0), preserving app data. The process
started and Home retained its previous prayer status. No destructive physical
fixtures were run.

Validation uses `testing/evidence/2026-10-09-remove-finish-typing/`:

- `npm run typecheck`: exit 0; full log and exit file.
- `npm test`: 347 tests, exit 0; full log and exit file.
- `python3 -m unittest discover -s scripts/tests -p 'test_*keyboard*py'`:
  18 native-reader tests, exit 0; full log and exit file.
- `npm run android -- --variant release --device Pray_Pixel_API_35 --no-bundler`:
  exit 0. Its full log is compressed because this local native build has no CI
  artifact host. No output was discarded. APK identity is in `build-identities.json`.
- iOS validation reused the **1.3.40 Release simulator native binary** with
  freshly exported production JavaScript/assets from this revision, followed
  by local signing and simulator installation. No native dependency changed.
  This is a JS regression check, not a newly compiled native iOS build.
  The full export log and bundle hash are included.

The first Android narrow check failed before any flow step: Maestro's `deviceInfo`
RPC lost its ADB socket (`UNAVAILABLE`, `Command failed ... closed`). The app
process was alive and the crash buffer was empty. Full driver output and the
original failed command are preserved. Under the owner's existing permission
for proven environment retries, only the test driver was restarted.

The prior Android main tail was deliberately interrupted when the owner narrowed
the task and requested removing the action without another full run. It is not
reported as passed. No full critical/main/rare/ordered run was started for this
UI removal. Earlier broad checks on source `91001b1` are historical evidence,
not full acceptance of this revision. Floating iOS and physical external-keyboard
acceptance are not claimed here.

The iOS report restore fixture initially selected `content-report-backdrop`,
which UIKit hides from the accessibility hierarchy while the card is modal.
The corrected fixture taps the observed open left edge (`3%,10%`), matching
the existing RPT-006 flow, and explicitly requires `inputView` to disappear.
Only that restore phase was checked again with the corrected fixture; the
application and its native binary were unchanged. Original failure output is
retained separately. Android's accessible backdrop selector already passed.

## Narrow form results

All five docked forms passed native complete-rectangle and exact-text restoration
checks on both platforms. Every observation requires the added action to be absent.

- Android: `npm run test:keyboard:android -- --mode docked --output <artifacts>`:
  exit 0 after the documented driver-only startup recovery.
- iOS: setup, answer and reflection open/native/restore phases: all exits 0.
  Report open/native phases: exit 0; corrected report restore: exit 0, explicitly
  verifying the keyboard disappears. Journal-only matrix: exit 0. The original
  combined iOS command remains exit 1 due to the documented fixture selector.

Full phase logs/exits, selected native screenshots and native observations are
in the `remove-action-android-contract-driver-recovered/`,
`remove-action-ios-contract/` and `remove-action-ios-journal/` evidence directories.
`remove-action-ios-report-fixed.log` and `.exit` contain the verified report
correction. These directories and the top-level `remove-action-*.log`, `.exit`
and `build-identities.json` are the complete artifact set for this report.
