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

Use Expo SDK 57's supported Keyboard Controller 1.21.9 for native viewport
avoidance and automatic window offsets, including Modal and rotation. A bounded
inner frame consumes the bottom safe area once and constrains absolute overlays.
A sheet overlay and its backdrop reach the screen edge; its footer consumes the
bottom safe area instead. Gorhom owns sheet positioning and footer measurement
within that frame, not a second keyboard inset. Managed sheet inputs deliberately do not register Gorhom's
independent keyboard handler. Remove app-level screen/keyboard height formulas
and fixed-device padding corrections.

`KeyboardSheet` alone remounts a sheet, only while it is closed and only when
the window geometry changes. A closed sheet is neither presented nor touchable,
even if a vendor animation retains an old closed position.

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

## References

- https://docs.expo.dev/versions/v57.0.0/sdk/keyboard-controller/
- `components/keyboard/`
- `scripts/keyboard_layout_bounds.py`
- `scripts/run_keyboard_contract.py`
