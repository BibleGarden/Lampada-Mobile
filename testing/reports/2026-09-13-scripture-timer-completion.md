# Scripture narration at timer expiry

Date: 2026-09-13. Base: `origin/main` at `2c0316c`.

## Changes

Timer expiry waits for scripture narration, including loading and pause, then
allows three seconds of silence before reflection. Music stays paused after
expiry. Manual completion runs immediately and only once. Extending the timer,
starting playback or opening an answer cancels pending navigation. Playback
errors stay visible. The listening hint is translated into English, Russian and
Ukrainian. Manual scenarios: SCR-016 through SCR-018 in `testing/TEST_PLAN.md`.

## Verification

- Full Node test suite: 203 passed, exit 0, including 12 new completion tests.
  Command: `node --experimental-strip-types --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test --test-reporter=dot lib/__tests__/*.test.mjs`.
- `npm run typecheck`: exit 0, no diagnostics.
- Tests cover the passage ending, loading, pause/resume, a late playback start,
  open answers, extra time, replay, manual completion, errors, untimed sessions,
  and cleanup. Fake timers verify the transition delay and prevent real waits.
- Native audio, the new hint layout and SCR-016 through SCR-018 have not been
  exercised on a simulator or physical device. No phone build or installation
  was performed.
