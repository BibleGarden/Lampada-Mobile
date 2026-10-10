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
keyboard height. Every keyboard viewport fills its window down to the bottom
edge (screens, transparent full-screen Modals), so it reserves
`max(bottom safe area, keyboard height)` as one UI-thread padding that follows
the keyboard animation frame by frame; a floating keyboard reserves nothing.
An inner frame constrains absolute children. A sheet fills the window with no
reservation, so the sheet and its backdrop reach the screen edge and its
container never changes with the keyboard. Its footer keeps a constant padding
above the bottom safe area, which Gorhom measures once. The keyboard height not
covered by that safe area is subtracted on the UI thread from the footer
position Gorhom computes, and that lifted position is what Gorhom's footer
container is placed at; the body ends above it. The actions never move outside
their container, because a child shifted out of its parent's bounds is drawn
but is not visible to Android accessibility. Gorhom owns sheet
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
visible; answers and reports do not hide actions.
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
