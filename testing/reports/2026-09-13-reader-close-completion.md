# Completion after leaving scripture reading

Date: 2026-09-13. Base: `b255c80`.

An expired prayer now opens reflection one second after the reader, answer and
narration are finished. Opening an activity again, extending the timer or
backgrounding cancels pending completion. Sheet opening is reported before its
animation; answer closure waits for recording cleanup. Manual completion retains
its duplicate guard. Context verses now use 55% opacity instead of 75%.

## Verification

- Full Node suite: 198 tests passed, exit 0, including seven new timing tests.
  Command: `node --experimental-strip-types --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test --test-reporter=dot lib/__tests__/*.test.mjs`.
- `npm run typecheck`: exit 0, no diagnostics.
- Timing tests cover unlimited reading after expiry, the full one-second delay
  after closing, reopening, extending the timer, background/foreground, leaving
  the screen and an unexpired timer.
- The architecture and affected manual/Maestro scenarios describe the new
  completion policy. The native reader-close scenario has not been rerun; the
  Node tests exercise scheduling and cancellation, not native sheet gestures.

## iPad installation

`npm run iphone`, with `DEVICE` selecting the physical iPad Pro 11-inch (M4),
built and installed standalone Release 1.0.17 with exit 0. Runtime preflight
passed and both required values were verified in the embedded bundle without
printing them. Xcode reported `BUILD SUCCEEDED` with compiler and bundler
warnings. `devicectl device info apps` confirmed version 1.0.17, and
`devicectl device info processes` confirmed the main Lampada process running.
