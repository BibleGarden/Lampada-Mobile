# ADR-0032: Ignore the system font size

- Status: Accepted
- Date: 2026-09-22

## Context

Font sizes are `sc()` tokens derived from the window geometry, and every screen
is laid out for them. React Native scales `Text` and `TextInput` by the system
font size by default; at the largest iOS Dynamic Type category the factor is
about ×2.35, so labels stop fitting and screens break. React 19 ignores
`defaultProps` on function components, so `Text.defaultProps` no longer works.

## Decision

`lib/disableFontScaling.tsx` replaces the `Text` and `TextInput` getters on the
`react-native` module exports with wrappers that default `allowFontScaling` to
`false`. It is the first import of `app/_layout.tsx`, so it applies to the app
and to libraries before any screen renders. An explicit `allowFontScaling` on a
component still wins.

## Options considered

### Scrollable layouts for enlarged text

Wrapping screens in scroll views with shrinking text. Rejected: large text
looked poor, the layout shifted at the normal font size, and it would require
reworking every screen before the release.

### Own `Text` and `TextInput` wrappers

Explicit and free of module patching. Rejected: nothing prevents a new screen
from importing `Text` directly from `react-native`, which silently brings the
scaling back, and library text stays scaled.

## Consequences

- The layout is stable regardless of the system font size.
- Users who rely on Dynamic Type do not get enlarged text; screen readers,
  labels and focus order are unaffected.
- If React Native changes its exports so they are no longer configurable,
  `Object.defineProperty` throws at startup instead of failing silently.

## References

- ClickUp: [Проверить accessibility Lampada](https://app.clickup.com/t/86cb8jrqy)
