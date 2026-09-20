# Stage 09 closure — remaining coverage gaps, run 2026-09-20…21

This report closes the remaining items of stage 09 «Re-run and fix the whole
e2e set» (ClickUp 86cb8kdyy) after the 2026-09-20 full pass (68 flows green,
PR #4). Each linked report holds the per-scenario evidence.

## What was covered

| Block | Task | Result | Report |
|---|---|---|---|
| Stage 02 technical risks evidence | 86cbj8tjw | Done: all five risks have an explicit verdict (four Covered, SQLite Covered indirectly with the NEEDS-ENV flows replaced) | `2026-09-20-stage02-technical-risks.md` |
| Reminders REM-001…015 | 86cbj8tju | Done: 10 scenarios automated and run green (001/002/004/005/006/008/011/013/014/015); 003/007/009/010/012 stay manual per plan §10 | `2026-09-20-reminders.md` |
| App lock LOCK-008…011 | 86cbj8tjz | Done: 008 hybrid (automation + manual switcher shot), 011 automated, 009/010 manual-on-device (Face ID has no simulator support) | `2026-09-20-app-lock-008-011.md` |
| Journal transcription JRN-010…013 | 86cbj8tjv | Done: all four green against the deterministic stub | `2026-09-20-jrn-transcription.md` |
| Stub-phase leftovers | 86cbj95j4 | Done: update soft/hard, scr-001 rework, scr-002 split, legacy favorites seeder, sqlite-lock via the new e2e hook, AI-late | `2026-09-20-stub-phase.md` |
| Content reports RPT-001…003 (feature merged after the plan) | — | Done: all three green with payload verification | `2026-09-21-content-reports.md` |

## Application change in this stage

`lib/store.ts` gained the `EXPO_PUBLIC_FORCE_SESSION_ERROR` e2e hook: a build
with this variable fails the first session start for topics beginning with
`STG`, exercising the threshold generic-catch path. It replaces the external
SQLite locking (impossible since WAL, `lib/db.ts:60`) and is inert in all
normal builds.

## Environment findings worth keeping

- Notification banners live in SpringBoard: Maestro cannot assert them, the
  runners take `simctl io screenshot` at the scheduled minute.
- Maestro matches element text as a full-string regex; multi-line labels need
  an explicit `(?s)`; children of accessibility-labelled elements are absent
  from the hierarchy (assert via the parent's label).
- `pressKey: HOME` backgrounds the app; Maestro cannot open the app switcher.
- Face ID is unavailable in the simulator by design; even Touch ID did not
  report hardware on the iOS 26.5 SE simulator, so LOCK-009/010 stay
  manual-on-device with ready flows.
- Simulator keychain item names are hashed; the practical check is the app
  group's item count plus plaintext greps.

## Verification after the stage

- `npm run typecheck` — exit 0.
- `npm test` — 215/215.
- Normal Release build reinstalled; final smoke flow passed.

## Still open (by design)

- Manual/hybrid per plan §10: REM-003/007/009/010/012, LOCK-008 switcher shot,
  LOCK-009/010 on a physical device.
- Stage 10 (regression) and stage 08 (reliability) remain as planned.
