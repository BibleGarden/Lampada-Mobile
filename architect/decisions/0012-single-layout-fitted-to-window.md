# ADR-0012: One layout for every orientation - the prototype frame fits into the window

- Status: Accepted
- Date: 2026-08-30
- Participants: QA lead, product owner

## Context

ADR-0011 made the tokens reactive: the styles are rebuilt when the window
geometry changes. But the scale itself was computed from the window width alone,
and the content column was constrained only on the session screen.

In iPad landscape (1210x834) this produced two independent defects on every
screen:

- **By height.** The width is large, so `sc()` inflated the type sizes, the
  paddings and the buttons to match it - and there is no height for such a scale.
  On the session screen the companion card hit its own minimum and was clipped,
  and the buttons went outside the frame.
- **By width.** The column took all 1210 pt: the question line on Reflect ran to
  72 characters against a comfortable 45-75, and the "Finish" button stretched
  across the whole window.

The app is vertical by its nature: a header, a focal element, text, an action.
Landscape gives it no new meaning - it gives less height and surplus width.

## Decision

One layout for every orientation. The prototype frame fits into the window as a
whole instead of being stretched by width.

- The scale is computed from both sides: `min(width / 294, height / 500)` with
  the previous cap by width. 500 is the shortest frame in which the layout still
  breathes (iPhone SE). On every portrait screen the width remains the leading
  dimension and nothing changes; in landscape the height takes over the
  constraint.
- The content column `column()` from `lib/theme.ts` is `maxWidth: sc(360)`, that
  is, in prototype units rather than screen ones. On a phone this cap is
  unreachable; on a tablet in portrait it gives almost the whole width; in
  landscape it centres the column and keeps the measure constant (~45 characters
  on any geometry).
- Every screen wraps its content in `column()`.

The composition does not change on rotation - it shrinks and is centred. This is
exactly the behaviour a user expects: the interface stays the same.

## Options considered

### A two-column layout in landscape

The ring with the goal on the left, the companion card on the right. The only
option that uses a wide short window rather than working around it. Rejected:
this is a second layout with its own markup, states and checks on each of the ten
screens, for the sake of an orientation in which a prayer app hardly lives. It
can be revisited if a scenario of an iPad on a stand appears.

### Scrolling in landscape

Cheap, but the session screen is not meant to be scrolled: the timer, the goal
and the card have to be visible at the same time. The other screens already have
scrolling and it works.

### Compute the scale from the short side of the screen

The tokens then do not change on rotation at all, but in landscape the layout
stays laid out for the portrait width and does not use the available height.
Rejected in ADR-0011 and not revisited here.

## Consequences

- Nothing is clipped in any orientation: verified on an iPad Pro 11 in landscape
  - the session, reflection, home, setup, threshold and settings screens.
- On a tablet in landscape a large empty margin remains on both sides. This is
  the deliberate price of a single layout.
- A new screen has to wrap its content in `column()`, otherwise in landscape it
  will stretch across the whole window.
- On a tablet in portrait the column became narrower by roughly 37 pt on each
  side: it now lives in prototype units too.

## References

- `lib/theme.ts` - `geometryFor`, `column`
- ADR-0011 - the reactive tokens this decision stands on
