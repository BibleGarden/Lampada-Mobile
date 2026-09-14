# iPad installation: scripture completion

Date: 2026-09-13.

- Installed Lampada 1.0.14, bundle `twinkler`, on the physical iPad Pro 11-inch
  (M4), iPadOS 26.6.1. The previous installed version was 1.0.13.
- Source: `codex/ipad-scripture-completion`, combining the existing interface
  changes at `e1f266f` with the scripture completion change.
- Build: `npm run iphone` with `DEVICE` explicitly set to the connected iPad.
  Local standalone Release, configured by `.env.local`.
- Preflight passed. The integrated source passed all 203 Node tests and
  `npm run typecheck`, both with exit 0.
- Xcode reported `BUILD SUCCEEDED`; build and installation exited 0. The build
  emitted native dependency and bundler warnings, with no error diagnostics.
- `devicectl device info apps` confirmed version 1.0.14 after installation.
  `devicectl device info processes` confirmed the main Lampada process running.
- The physical narration-at-expiry scenario has not yet been exercised.
