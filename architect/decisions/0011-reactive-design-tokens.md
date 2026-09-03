# ADR-0011: Reactive visual tokens instead of module-level constants

- Status: Accepted
- Date: 2026-08-30
- Participants: QA lead, product owner

## Context

The prototype tokens scale from the window width: `sc(v)` converts the pixels of
the 294 pt mock-up into the points of the current screen. Previously `scale` was
computed once when `lib/theme.ts` was loaded, and the styles were assembled with
`StyleSheet.create` at module level - that is, the numbers were frozen before the
first render.

While the app lived only on a phone in portrait this was not noticeable. Three
circumstances made the problem real:

1. A tablet layout appeared with its own scale cap and a full-width column - the
   tokens became far more dependent on the geometry.
2. In iPadOS 26 Apple dropped `UIRequiresFullScreen`: an app must support every
   orientation and resizable windows. An iPad can no longer be locked into
   portrait, which makes a change of geometry in the field inevitable.
3. Split View and Stage Manager change the window width without any rotation at
   all.

When the geometry changes, the width and the height swap places, while the type
sizes, the paddings, the button sizes and the "tablet/phone" threshold stay from
the starting orientation - the layout silently becomes wrong.

## Decision

The geometry is kept in a mutable module variable and recomputed on every change
of the window; the styles are assembled inside the render.

- `sc()` reads the current geometry, and `isTablet()` became a function.
- `Dimensions.addEventListener('change', …)` refreshes the geometry before React
  starts re-rendering.
- `useStyles(factory)` subscribes to `useWindowDimensions()`, synchronises the
  geometry and rebuilds `StyleSheet.create` through `useMemo`.
- Every screen and component declares
  `const stylesFactory = () => StyleSheet.create({…})` and gets its styles as
  `const styles = useStyles(stylesFactory)`.
- Whether this is a tablet is judged by the short side of the window: it does not
  change on rotation, so the layout type is the same in portrait and in
  landscape.

## Options considered

### Lock the orientation and keep the constants

The cheapest option, and it is applied for the iPhone (`app.json` fixes
`UISupportedInterfaceOrientations` to a single portrait). But on an iPad, iPadOS
26 ignores such a restriction, and Split View breaks the layout without any
rotation. As the only measure it does not work.

### Compute `scale` from the short side of the screen

Then the tokens do not change on rotation at all. It does not solve Split View
and leaves landscape laid out for the portrait width.

### Drop tablet support (`supportsTablet: false`)

Removes the question, but closes off the iPad as a platform. Not chosen as a
product decision.

## Consequences

- The screens rebuild correctly for rotation, Split View and Stage Manager.
- Every new screen has to assemble its styles through `useStyles`, otherwise its
  sizes will freeze again. Module-level constants that depend on `sc()` are not
  allowed - use functions instead (see `cardLineHeight()` in
  `components/CompanionDock.tsx`).
- The styles are rebuilt on every change of geometry rather than once. Between
  changes `useMemo` returns the same object, so a render on a timer tick is
  unaffected.
- Verifying rotation stays manual: `simctl` cannot rotate a device.

## References

- `lib/theme.ts`, `useStyles`
- [TN3192: Migrating your iPad app from the deprecated UIRequiresFullScreen key](https://developer.apple.com/documentation/technotes/tn3192-Migrating-your-app-from-the-deprecated-UIRequiresFullScreen-key)
- ADR-0010 - the Live Activity because of which the app does not start in Expo Go
