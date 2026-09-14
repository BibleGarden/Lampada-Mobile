# Keyboard dismissal across text-entry screens

Verified on 2026-09-12 using the local Debug app connected to Metro on the
iPad (A16) simulator, iOS 26.5, with the Russian software keyboard.

A source search of `app/` and `components/` found four system-keyboard entry
points. PIN entry uses the app's own numeric keypad.

| Surface | Portrait side margins | Landscape side margins | Result |
| --- | --- | --- | --- |
| Prayer goal | Pass | Pass in the preceding setup check | Existing fix retained |
| Reflection | Pass | Pass | Existing ScrollView dismissal already covers the viewport |
| Journal search | Pass | Pass | Added background touch handling to the full screen |
| Answer sheet | Pass after rotation settled | Pass | Moved background touch handling outside the constrained column |

The journal and answer sheet failures were reproduced before editing. Both
left and right outside taps now dismiss the keyboard. The answer sheet handle
also dismisses it. Taps inside the answer field retain editing, a typed test
character survives rotation and dismissal, and backdrop taps do not discard an
unsaved answer. A tap during the rotation transition was not effective; both
margins worked after the layout settled.

Reflection and answer checks used a temporary route rendering the actual
components with synthetic in-memory state. The route was removed and the
original state restored. No prayer or answer was saved, no audio was recorded,
and no AI request was initiated. The simulator returned to setup in landscape
with its original empty topic and ten-minute duration.

`npm run typecheck` and `git diff --check` passed with exit code 0.
Android, physical devices and floating keyboards were not exercised.
