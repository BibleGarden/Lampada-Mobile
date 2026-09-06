# Answer consent keyboard regression

## Change

AnswerSheet explicitly blurs its input and dismisses the keyboard at the start
of Save, before asynchronous work and before presenting the consent modal.
This prevents a focused underlying input from bringing the keyboard back when
the native consent modal dismisses. The existing dismissal after saving remains.

## Validation

On the Pray SE iOS 26.5 simulator, exercised the real AnswerSheet and
PrivacyConsentDialog with a temporary local harness. Store saving and consent
persistence were replaced by in-memory callbacks; no answer was sent to a server
and no stored permissions were changed. The harness was removed afterward.

1. Open the answer sheet and focus the input.
2. Display the software keyboard and enter a nonempty test answer.
3. Tap Save while the keyboard is visible.
4. Verify the answer-context consent modal appears without the keyboard.
5. Tap Allow.
6. Verify the save callback receives the entered text, the modal and answer sheet
   close, and the keyboard remains hidden after the dismissal animation.

Result: passed. The final simulator screenshot and accessibility observations
showed the saved test text and `Keyboard: hidden`, with the underlying screen
fully visible. This validates the native UI sequence; database persistence and
live AI processing were outside this focused check.

`npm run typecheck`: exit 0, full output reviewed, no errors or warnings.
`git diff --check`: exit 0.

## Manual regression scenarios

- Repeat the sequence above after allowing core AI and with answer-context consent
  undecided. Do not hide the keyboard before tapping Save.
- Repeat with Do not send: save locally and close the keyboard and sheet.
- Repeat with an existing answer-context decision: save without a consent modal.
- Dismiss the consent dialog without a decision: retain the draft and allow the
  input to regain focus when explicitly tapped.
