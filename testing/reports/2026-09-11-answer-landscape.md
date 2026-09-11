# Answer entry on landscape iPad

Verified on 2026-09-11 using the iPad (A16), iOS 26.5 simulator and the local
development app.

Landscape tablets now show the question in a scrollable left column, with the
answer field and actions on the right, within a layout up to 1120 pt wide.
The voice hint is hidden while typing. The handle height is recalculated when
the window changes, matching the content-height calculation after rotation.

- With the reported multi-line question and a docked Russian keyboard, the
  answer field had room for multiple lines and all actions stayed above the
  keyboard.
- A short answer retained its text and input focus when rotating to portrait
  and back to landscape.
- Portrait restored the vertical question/form layout.
- `npm run typecheck` passed (exit 0).
- `git diff --check` passed (exit 0).

A temporary route rendered the actual `AnswerSheet` with a question passed as
a preview parameter. It restored the previous in-memory questions and answers
after verification and was removed. No answer was saved or audio recorded.
Physical devices, Android, Split View and floating keyboards were not exercised.

Screenshots were captured with `simctl io screenshot` and oriented for viewing:

- [Landscape with keyboard](../evidence/2026-09-11-answer-landscape/ipad-landscape.png)
- [Portrait after rotation](../evidence/2026-09-11-answer-landscape/ipad-portrait.png)
