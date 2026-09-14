# Scripture offline recovery

Date: 2026-09-13.

## Diagnosis

- The physical iPad had Lampada 1.0.18 installed from the local Release build.
  The local environment preflight passed, and the installed build source bundle
  contained both configured runtime values without printing them.
- A read-only copy of the iPad SQLite database contained 31 shown Scripture
  snapshots. Twenty-eight matched the active Russian BTI translation, so one
  failed request exposed a long saved-history trail.
- A live request with the active translation and the 30 latest canonical
  exclusions returned HTTP 200. The same client also parsed a live response and
  loaded the 66-book catalogue. The observed offline state was therefore not a
  persistent URL, key or server-contract failure.

## Result

- Offline recovery keeps the current in-session trail and appends only enough
  recent compatible snapshots to expose seven entries in total.
- The offline caption is now an explicit retry action. A recovered connection
  can request a fresh passage without walking through the saved history first.

## Checks

| Check | Result |
|---|---|
| Full Node test suite with the dot reporter | exit 0, 200 tests |
| `npm run typecheck` | exit 0 |
| `npm run env:check:local` | exit 0 |
| Live Scripture selection and book catalogue | HTTP 200 |
| `npx expo-doctor` | exit 1: 20/21 checks passed; 22 unrelated Expo SDK 57 patch-version mismatches remain |

Lampada 1.0.19 was built and installed on the physical iPad with
`DEVICE=<iPad identifier> npm run iphone`. Xcode reported `BUILD SUCCEEDED`;
`devicectl` confirmed both the installed version and the running Lampada
process. The live API was healthy after installation, so the offline retry flow
was not forced on the owner's data and still requires visual verification when
the state occurs naturally.
