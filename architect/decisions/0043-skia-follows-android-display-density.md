# ADR-0043: Skia canvases follow the current Android display density

- Status: Accepted
- Date: 2026-10-14
- Participants: product owner, developer

## Context

A closed-test tester on a Samsung Galaxy Z TriFold (unfolded inner display,
landscape, Android 16, build 1.4) saw the Home lamp shifted right of the
content column, with the bowl over the "Keep the flame" title, and the
reflection ember right of the column centre. The header, the dots and Start
were in the column.

Android 16 ignores the portrait lock of an app targeting SDK 36 on displays with
a smallest width of 600 dp or more, so the app runs in the full landscape window
there. The layout itself handles that window: a cold start in the same window
(emulator at 2160x1584, density 400, orientation request ignored) centres the
lamp and keeps it clear of the title (ADR-0012).

The defect appears only when the display density changes while the process
lives. The TriFold has a different density on its cover and inner screens, and
Samsung's screen zoom changes it too. `react-native-skia` 2.6.2 reads
`DisplayMetrics.density` once, when its Android `PlatformContext` is created
with the React context, and every canvas scales its picture by that value
(`RNSkPictureView`, `JniSkiaPictureView`). React Native lays the canvas out in
dp at the new density, but Skia keeps scaling its drawing by the old density. The
picture is therefore scaled by `old / new` from the canvas's top-left corner:
it grows and moves right and down. On the emulator, starting at density 520 and
switching to 400 with the app running reproduces the tester's screenshots
(ratio 1.3). Upstream `main` (checked on 2026-10-14, latest release v3.4.3)
still reads the density only once.

## Decision

`patches/@shopify+react-native-skia+2.6.2.patch` makes the Android platform
context track the density:

- `PlatformContext` registers `ComponentCallbacks` on the React context and
  passes the current `DisplayMetrics.density` to native code on every
  configuration change. `SkiaManager.destroy()` unregisters them, so a reload
  does not leak the old context.
- `JniPlatformContext` keeps the density in an atomic, written on the main
  thread and read on the drawing threads.
- `RNSkPlatformContext::getPixelDensity()` becomes virtual, and the Android
  context returns the live value, so every draw uses the current density.

iOS is not affected: the screen scale of a running app does not change.

## Options considered

### Patch the dependency to track the density

Removes the defect for every canvas: the lamp, the ember, the screen
backgrounds and the session halo. Chosen.

### Restart the React context or the process on a density change

Loses the running prayer state and the timer. Rejected.

### Compensate in the app's drawing code

The app would have to know Skia's frozen density, which is not exposed, and
scale every canvas by it. Rejected: it hides the defect in each component
instead of removing it in one place.

## Consequences

- After unfolding or a display-size change, the Skia drawings stay inside
  their views and centred in the content column.
- Accepted limitation: after `RNSkiaModule.invalidate()` on a JS reload, a
  queued draw may read the density through the old raw `JniPlatformContext*`,
  the same pattern as the existing `runTaskOnMainThread` and `raiseError`.
  Release builds do not reload in normal use.
- Accepted limitation: the density comes from the Application resources, so an
  activity on a secondary display (DeX, an external monitor) would use the
  default display's density.
- The patch must be recreated or dropped on every `react-native-skia` update;
  `patch-package --error-on-fail --error-on-warn` fails the install until then.
- Upstream issue: not filed yet (no link).

## Drop procedure

When upstream Android `PlatformContext` follows density changes:

1. Delete `patches/@shopify+react-native-skia+*.patch`.
2. If no other patches remain, follow step 2 of the ADR-0041 drop procedure.
3. Mark this ADR as superseded.

## References

- ClickUp: https://app.clickup.com/t/123pfqn2y1r
- `node_modules/@shopify/react-native-skia/android/src/main/java/com/shopify/reactnative/skia/PlatformContext.java`
- `node_modules/@shopify/react-native-skia/cpp/rnskia/RNSkPictureView.h`
- ADR-0012 - the single layout fitted to the window
