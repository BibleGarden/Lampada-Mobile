# Setup keyboard dismissal

Verified on 2026-09-12 using the actual setup screen in a local Debug build
connected to Metro, on the iPad (A16) simulator in landscape, iOS 26.5.

The keyboard dismissal surface now wraps the centered content column and
occupies the full screen. Previously, the tablet's side margins were outside
the Pressable that dismissed the keyboard.

- Before the change, tapping the left margin left the keyboard visible.
- After the change, tapping the left margin, right margin or space above the
  field dismissed the keyboard.
- A tap inside the field kept editing active. Text entered with the software
  keyboard remained after dismissal.
- The duration increment and decrement buttons still worked. The initial empty
  topic and ten-minute duration were restored after checking.
- `npm run typecheck` and `git diff --check` passed with exit code 0.

These checks cover the outside-tap behavior in SETUP-004; long-goal scrolling
and starting a prayer were not exercised in this run.
