# ADR-0041: Patch the Android shared object registry of expo-modules-core

- Status: Accepted
- Date: 2026-10-10
- Participants: product owner, developer

## Context

A cold launch of the Android build crashed with
`NativeDatabase.prepareAsync … Cannot use shared object that was already released`
(`ERR_USING_RELEASED_SHARED_OBJECT`) while the startup readers of the settings,
the scripture preferences and the home screen queried SQLite in parallel. The
statement in question had been created by `SQLiteDatabase.prepareAsync` a moment
before and was alive; the app never closes the database or finalizes a statement
during startup.

Every Expo SQLite query creates a `NativeStatement` shared object on the JS
thread and then calls an async function that receives the database and the
statement by their numeric ids. On Android the async function converts those
ids back to native objects on the `expo.modules.AsyncFunctionQueue` thread.
`SharedObjectRegistry` in `expo-modules-core` 57.0.14 (unchanged up to 58.0.15)
writes its `HashMap` under a lock but reads it in `toNativeObject` without one.
A read that overlaps a resize caused by another `add` on the JS thread misses
a live id, and `ensureWasNotRelease` then reports it as released. A model of the
registry with the same locking misses live ids about once per 90 000 lookups
with unlocked reads and never with locked ones. The iOS registry serializes all
access and is not affected.

## Decision

`patches/expo-modules-core+57.0.14.patch` makes every read of the registry's
`pairs` and `currentId` hold the same lock as its writes. `postinstall` applies
it with `patch-package --error-on-fail --error-on-warn`, so a patch that no
longer applies, or that applies to a different `expo-modules-core` version than
the one it was made for, stops the install instead of shipping the race. Startup
failures of the settings load stay fatal (ADR-0040): they report real defects
instead of leaving the settings unloaded.

## Options considered

### Lock the registry reads in a dependency patch

Removes the race where it is. Chosen.

### Serialize all SQLite calls in `lib/db.ts`

A single queue reduces how often a conversion overlaps a registry write, but
other modules (`File`, audio players) still create shared objects on the JS
thread while a query is converted. Rejected: it hides the race instead of
removing it and slows every startup read.

### Catch the error and retry the query

Rejected: it masks a native defect, and the same race can hit any async call
with a shared object argument, not only SQLite.

## Consequences

- Android startup readers no longer fail at random on a live statement.
- The patch must be recreated or dropped on every `expo-modules-core` update;
  the install fails loudly until then.
- Upstream issue: pending filing, not yet reported (no link).

## Drop procedure

When upstream `SharedObjectRegistry.toNativeObject` reads `pairs` and
`currentId` (including `ensureWasNotRelease`) under the registry lock:

1. Delete `patches/expo-modules-core+*.patch`.
2. If no other patches remain, remove the `postinstall` script and the
   `patch-package` devDependency from `package.json`, refresh
   `package-lock.json`, and delete `patches/`.
3. Mark this ADR as superseded.

Until then, `--error-on-warn` makes every `expo-modules-core` bump fail the
install, which forces re-evaluating the patch: check the new registry source,
then either rename and regenerate the patch or drop it as above.

## References

- `node_modules/expo-modules-core/android/src/main/java/expo/modules/kotlin/sharedobjects/SharedObjectRegistry.kt`
- `node_modules/expo-modules-core/android/src/main/java/expo/modules/kotlin/functions/AsyncFunctionComponent.kt`
