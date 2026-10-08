# ADR-0037: Native window for the Android lock gate

- Status: Accepted
- Date: 2026-10-08
- Participants: Application owner and implementation agent

## Context

Android Release PIN testing exposed Home controls below the lock overlay in the
native accessibility hierarchy. The React Native navigation wrapper already
used `no-hide-descendants`, but native-stack screens remained reachable.

## Decision

Render the Android lock screen and privacy curtain inside a native `Modal`.
Keep navigation mounted so unlocking restores its state. Android Back cannot
close the modal. iOS retains its existing root overlay and accessibility modal
semantics.

## Options considered

- A root React Native wrapper: already present; failed the native hierarchy check.
- Unmount navigation: would discard the screen and prayer state during locking.
- A native modal window: excludes covered controls while preserving navigation.

## Consequences

PIN and background-return tests must verify both access isolation and preserved
screen state. Native permission and biometric dialogs must remain usable above
the lock window. Physical-device biometric acceptance remains a separate check.

## References

- `components/LockGate.tsx`
- `testing/android-e2e/android-lock-003-wrong-and-correct-pin.yaml`
- `testing/android-e2e/android-lock-007-background-timeout.yaml`
