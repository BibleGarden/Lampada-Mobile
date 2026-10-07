# PR #36 shared Android preflight — 2026-10-07

Review of `eae886e5345485bb0187e2717f606a7756fd0247` found that the newly
documented direct Maestro command for ANS-024 bypassed installed-APK preflight.
Because the flow clears app state and allows AI requests, an installed store
or stale production APK must be rejected before Maestro runs.

## Change

`scripts/test-android.sh` now owns the existing preflight and sequential flow
execution. The critical wrapper passes its ten ordered entries to this shared
runner. Individual flows use it through:

```bash
npm run test:e2e:android -- android-ans-024-recordings-keyboard
```

Flow names are validated before device operations. The existing manifest
validator remains the only source of truth for installed channel/API checks;
its logic is not duplicated. README and test-plan instructions now use the
guarded command. App source, environment variables and the Release 1.3.6 APK
are unchanged; the
[native keyboard verification](./2026-10-07-android-recordings-keyboard-approved.md)
remains applicable to the same app code.

## Verification

The new subprocess integration tests execute the actual shell runners with
isolated command fakes for adb, APK extraction and Maestro, but invoke the real
manifest validator. Fixtures contain reserved test origins and a dummy key.
They do not boot an emulator, clear app data or contact any API.

| Criterion | Result |
| --- | --- |
| Individual ANS-024 rejects store, missing-metadata, wrong-API and production APK manifests before Maestro | Passed; temporary APK removed on rejection |
| A valid individual test APK reaches Maestro only after validation | Passed; per-flow log and exit recorded |
| Critical tier uses the same preflight, rejects a store APK and preserves all ten entries with smoke/relaunch order | Passed |
| Failed environment check or invalid flow name starts no scenario | Passed |
| A scenario failure stops execution before subsequent flows | Passed; original nonzero exit preserved |
| Typecheck and complete unit suite | Both exit 0 |
| Shell syntax | Exit 0 |

Full outputs: [runner tests](../evidence/2026-10-07-android-runner-review/runner-tests.log),
[typecheck](../evidence/2026-10-07-android-runner-review/typecheck.log),
[unit suite](../evidence/2026-10-07-android-runner-review/unit.log).
Exact commands, exit codes and scope are in
[results.json](../evidence/2026-10-07-android-runner-review/results.json).
Checks used local Node 22.23.3 on 2026-10-07. The integration-test assertions,
not a new native E2E run, prove the runner gate and ordering.

No build, native E2E retry, merge or store publication was performed for this
review fix. iOS and the wider remaining release suite are still outside the
verified scope.
