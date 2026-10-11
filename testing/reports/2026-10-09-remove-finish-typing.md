# Remove the unsolicited Finish typing action — 2026-10-09

Superseded: this report covers source `57dadfd` only. Later revisions of the
same PR, from `fa827ff` on, change the sheet geometry and are not covered here;
the final integrated run of the merged revision gets its own report.

The owner requested restoring the existing interface. The added action was
removed from setup, answers, reflection, reports and journal, together with its
component and locale keys. Existing Done/Enter submission and outside-tap
dismissal remain unchanged. The native contracts use existing sheet handles,
titles and report backdrops.

Application source: `57dadfd`. Android Release **1.3.41** was installed on the
owner's phone with `adb install -r` (exit 0), preserving app data; no
destructive physical fixtures were run. iOS reused the **1.3.40 Release
simulator native binary** with freshly exported JavaScript and assets from this
revision; no native dependency changed, so this is a JS regression check, not a
new native iOS build. Identities and hashes are in `build-identities.json`.

## Results

- `npm run typecheck`: exit 0. `npm test`: 347 tests, exit 0. Native-reader
  unit tests: 18, exit 0.
- Android, `npm run test:keyboard:android -- --mode docked` on the `emulator-5554`
  emulator (not the owner's phone): all five forms
  passed complete-rectangle and exact-text restoration checks, exit 0. The first
  attempt failed before any flow step because Maestro's `deviceInfo` RPC lost its
  ADB socket; the app process was alive and the crash buffer empty. Under the
  owner's permission for proven environment retries, only the driver was
  restarted.
- iOS, docked: setup, answer, reflection and journal passed open, native and
  restore phases, exit 0. The report restore fixture first tapped
  `content-report-backdrop`, which UIKit hides while the card is modal. The
  corrected fixture taps the open left edge (`3%,10%`), as RPT-006 does, and
  requires `inputView` to disappear; its restore phase then passed, exit 0.

No full critical, main, rare or ordered run was made on this revision. Floating
iOS and physical external-keyboard acceptance are not claimed.

## Evidence

`testing/evidence/2026-10-09-remove-finish-typing/` holds `build-identities.json`
and, for each form, the native screenshot `<form>-open.png` and the native
observation `<form>-native-bounds.json`, in
`remove-action-android-contract-driver-recovered/`, `remove-action-ios-contract/`
and `remove-action-ios-journal/`. Full command logs and exit files are PR
artifacts, not repository files.
