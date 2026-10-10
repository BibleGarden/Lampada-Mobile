# ADR-0038: Shared keyboard state and bounded form viewports

- Status: Accepted
- Date: 2026-10-09
- Participants: Application owner and implementation agent

## Context

The owner reproduced keyboard overlap in preparation and then in answers on a
physical Samsung Fold5. Independent screen listeners, manual sheet heights,
zero-height visibility assumptions and missing bottom safe areas allowed one
form to improve while another stayed broken. Existing tests could find a button
in accessibility without proving that its entire native rectangle was usable.

## Decision

Separate software visibility from occupied space and field focus in a single
application provider. A show or zero-height frame never implies hide; deferred
actions wait for didHide, independently of field focus. Keyboard Controller owns native dismissal, including blur before
IME hide. React Native responder release is unconditional because Controller
dismissal is a no-op for an already hidden IME; single-phrase fields submit before explicitly dismissing. Classify narrow iPad frames against the current display.

Use Expo SDK 57's supported Keyboard Controller 1.21.9 for the animated
keyboard height. The React Native classifier alone decides whether a docked
keyboard is present; Keyboard Controller supplies only animation frames. The
reservation is its height while the classifier reports a docked keyboard or
while a Keyboard Controller transition runs (Android reports a hide at the start
of its animation), and zero otherwise, because Keyboard Controller can keep a
stale height after a fast input-method switch. Every keyboard viewport fills its
window down to the bottom edge (screens, transparent full-screen Modals), so it
reserves `max(bottom safe area, keyboard height)` as one UI-thread padding that
follows the keyboard animation frame by frame; a floating keyboard reserves nothing.
An inner frame constrains absolute children. A sheet fills the window with no
reservation, so the sheet and its backdrop reach the screen edge and its
container never changes with the keyboard. Its footer keeps a constant padding
above the bottom safe area, which Gorhom measures once. The keyboard height not
covered by that safe area is subtracted on the UI thread from the footer
position Gorhom computes, and that lifted position is what Gorhom's footer
container is placed at; the body ends above it. The actions never move outside
their container, because a child shifted out of its parent's bounds is drawn
but is not visible to Android accessibility. The lift stops at a minimum body
height even when the keyboard is taller than the sheet allows (a full-screen
input method, the low snap point on a small screen): Android clears focus inside
a view that shrinks to zero size, and typing would go nowhere. Gorhom owns sheet
positioning and footer measurement within that window, not a second keyboard
inset. Managed sheet inputs
deliberately do not register Gorhom's independent keyboard handler. Remove
app-level screen/keyboard height formulas and fixed-device padding corrections.

Gorhom 5.2.14 does not reposition a closed sheet when its container changes
(`getEvaluatedPosition` has no position for index -1), and it fixes a
programmatic close target when the close starts. Because the sheet container
changes only with the window, a close always slides to the screen edge.
`KeyboardSheet` alone remounts a closed sheet when the window geometry changes,
and a sheet rotated while open right after it closes. A closed sheet is neither
presented nor touchable.

Preparation and reflection defer lower actions while a software keyboard is
visible; answers and reports do not hide actions. The answer sheet's snap is a
convergent reconciliation, not a command per event: a visible keyboard with a
focused field requires the full-height snap, its hiding returns the sheet to
the resting snap with one request, after which the person chooses the snap
again, including by a gesture. A tap on the handle hides the keyboard and
returns the sheet like any other hide; a drag of the handle leaves the snap to
the person. Every
keyboard or focus change requests the target snap without comparing it with the
sheet index, which lags behind the animation on the JavaScript thread. A fast
input-method switch delivers hide and show while the sheet is still moving, and
Gorhom drops a request for the destination of its running animation even when an
earlier request that has not reached the UI thread changes that destination.
The full-height target is therefore checked again whenever Gorhom's animated
index settles on a whole number, which also covers a stop at the previous snap
that Gorhom reports through neither `onChange` nor `onAnimate`.
Use compact floating inputs for an Android floating panel that reports no occupied
bottom strip. Preserve existing outside-tap dismissal and native submission keys;
do not add a separate dismissal action. Preserve transactional save and audio lifecycle ownership.

## Validation contract

- Unit sequences: zero-height show, narrow positive-height iPad float, animation
  close, mode changes, rotation, focus without software visibility and the iPad
  hardware-keyboard shortcut bar.
- Native bounds: whole input/action rectangles fit the OS usable region, inputs
  do not overlap lower actions, floating inputs are compact, deferred controls
  are absent, and focus without a software IME remains usable.
- Staged Maestro: all five forms retain typed text through dismissal; answer
  saving/reopening and reflection/history persistence are verified.
- UIKit counterparts check complete native rectangles against inputView/window
  frames; accessibility does not expose iOS safe-area insets.
- Native checkpoints run after the Maestro driver exits, so a second Android
  automation session cannot invalidate the first one.

## Consequences

A new native dependency requires rebuilding both standalone platforms. Overlay
pointer events and modal accessibility must include both body and footer. Native
bounds and real floating-keyboard runs remain necessary; geometry-unit tests
alone cannot establish visual acceptance. Hardware-focus emulation is recorded
separately from acceptance on a physical external keyboard.
A keyboard viewport must fill its window to the bottom edge; a shorter
container would need its own window offset.

## References

- https://docs.expo.dev/versions/v57.0.0/sdk/keyboard-controller/
- `components/keyboard/`
- `scripts/keyboard_layout_bounds.py`
- `scripts/run_keyboard_contract.py`
