# Android ANS-024 fix verification — 2026-10-07

The owner explicitly approved one corrected invocation each of Android ANS-024
and critical text-answer persistence, plus publishing source changes, reports,
logs and screenshots in the Lampada-Mobile PR. **Both checks passed.** This
report is the final verification for
[the Android ANS-024 ticket](https://app.clickup.com/t/123pfqn27w9); the
[earlier report](./2026-10-07-android-recordings-keyboard.md) remains an immutable
record of the initial failures and their diagnoses.

## Build and result

Standalone Android Release 1.3.6, app-code commit
`ce58ebaab5777cabfa4b109c29869ed426c46fd6`, Expo SDK 57 / React Native 0.86.3.
Test inputs came from `eb1abd7`. Changes after the build affect tests and reports
only; the application source and APK are unchanged. The installed APK was pulled
and matched SHA-256
`81c5b5ccda7ea5a7de2a9d3b443708057598044db00b9231424fa1064ca1b760`.
The manifest validated its test channel and real test API origin against
`.env.local`; the bundled test origin/key had already been verified without
printing credentials. APKs and credentials are excluded from publication.

Environment: existing Pixel_9_Pro_API_35, Play Store x86_64 API 35,
Emulator 37.2.12, Russian Gboard, 480×1071 / density 180, preserving the original
logical viewport. Display overrides were reset and the emulator shut down
after the checks; all cleanup commands exited 0. The fixed test Release remains
installed for subsequent testing.

| Acceptance criterion | Result | Evidence |
| --- | --- | --- |
| Opening existing voice recordings hides the answer keyboard and exposes recording actions | Passed in corrected ANS-024, exit 0 | [Full log](../evidence/2026-10-07-android-recordings-keyboard/ans024-approved.log), [recordings screenshot](../evidence/2026-10-07-android-recordings-keyboard/after-recordings-approved.png) |
| Closing recordings preserves the exact draft and restores input focus/editing | Passed: original text matches, keyboard returns, inserted marker leaves every original character intact | [Editing screenshot](../evidence/2026-10-07-android-recordings-keyboard/after-editing-approved.png), [copy/assert commands](../evidence/2026-10-07-android-recordings-keyboard/ans024-editing-commands.json) |
| A saved text answer is restored when reopened | Passed, corrected critical entry exit 0 | [Full log](../evidence/2026-10-07-android-recordings-keyboard/answers-approved.log) |
| All ten Android critical scenario IDs have a successful result on Release 1.3.6 | Passed across the recorded blocks and approved corrected text-answer invocation; not a new single full-suite rerun | [Combined latest results](../evidence/2026-10-07-android-recordings-keyboard/approved-results.json), earlier per-entry logs linked from the initial report |
| TypeScript and complete unit suite | Both exit 0 on unchanged app code | [Typecheck](../evidence/2026-10-07-android-recordings-keyboard/typecheck.log), [unit suite](../evidence/2026-10-07-android-recordings-keyboard/unit.log) |

## Corrected test preconditions

The initial ANS-024 invocation passed the native keyboard and retention checks
but failed its final edit assertion: `eraseText` only deleted before the caret,
leaving a suffix. The corrected check inserts `1` at the actual caret and
asserts that removing it restores the exact original text. No dismissal or
retention assertions were dropped. The approved run passed this check.

The initial critical text-answer input used a five-minute prayer that expired
before the post-save assertion; full timestamps and the reflection screenshot
are preserved in the initial report. Its fixture now uses an untimed prayer;
the saved-answer assertions are unchanged. Deadline behavior passed separately
in the finite-session critical entry on the same APK. The approved corrected
entry passed, and the original nonzero result was retained.

The native change blurs the answer input and makes it non-editable while the
recordings sheet covers it. The draft stays in component state. The acceptance
checks test real Android keyboard visibility and user interaction; host-only
unit tests cannot prove this native focus behavior.

## Exact commands and new evidence

The two commands, run once each with explicit permission, were:

```bash
maestro --device emulator-5554 test --test-output-dir "$run_dir/approved-two/android-ans-024-recordings-keyboard" testing/android-e2e/android-ans-024-recordings-keyboard.yaml
maestro --device emulator-5554 test --test-output-dir "$run_dir/approved-two/android-stage04-answers-text" testing/android-e2e/android-stage04-answers-text.yaml
```

Both exit codes and UTC start/end times are in
[approved-invocations.json](../evidence/2026-10-07-android-recordings-keyboard/approved-invocations.json).
Frozen inputs are
[ANS-024](../evidence/2026-10-07-android-recordings-keyboard/android-ans-024-recordings-keyboard-approved.yaml)
and [text persistence](../evidence/2026-10-07-android-recordings-keyboard/android-stage04-answers-text-approved.yaml).
The complete approved runner exited 0. No further retries were performed.

## Scope

This verifies the Android recordings keyboard fix. iOS behavior has not been
retested, the wider remaining release suite remains incomplete, and the
content-report dialog keyboard defect is separate and unfixed. GitHub Actions
workflow inventory was empty on 2026-10-07; validation is from the recorded
local commands, not a claimed CI pipeline. No store publication or merge was
performed.
