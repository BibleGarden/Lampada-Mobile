# Reflection keyboard layout

Verified on 2026-09-11 with the local development app on an iPad (A16)
simulator running iOS 26.5. The interface and docked keyboard used Russian.

## Change

The reflection screen now reserves the keyboard's occupied area with
`KeyboardAvoidingView`. While editing, the input grows to fill the available
height below the question and the tablet column expands up to 960 pt wide.
The decorative header and completion actions are
hidden until the keyboard closes, preventing the buttons from glowing through
the translucent keyboard.

## Verification

- Manual native UI checks passed in portrait and landscape: the question and
  entire input card remained above the keyboard. The revised field used the
  available height in portrait and expanded horizontally in landscape.
- Rotating with the software keyboard open retained the entered text and
  adjusted the layout.
- Tapping outside the field and pressing the keyboard's Done button restored
  the completion actions without losing text.
- Save and finish returned Home; the journal displayed the saved takeaway.
- `npm run typecheck` passed (exit 0).
- `git diff --check` passed (exit 0).
- An independent review of the keyboard handling found no blocking issues;
  the subsequent input sizing adjustment was checked locally.

A temporary Maestro navigation helper failed before reaching reflection: its
phone-specific close-button coordinate missed the centered iPad column. It was
not rerun. Navigation and the checks above were completed through the native UI.
The full helper output is in `/tmp/pray-reflection-enter.log`.

Physical devices, Android, small iPhones, floating keyboards and oversized
generated questions were not exercised in this check.

## Evidence

- [Portrait with keyboard](../evidence/2026-09-11-reflection-keyboard/ipad-portrait.png)
- [Landscape with keyboard](../evidence/2026-09-11-reflection-keyboard/ipad-landscape.png)
- [After Done](../evidence/2026-09-11-reflection-keyboard/ipad-done.png)

Screenshots were captured with `simctl io screenshot`. Images were
rotated to their displayed orientation without cropping or altering the UI.
