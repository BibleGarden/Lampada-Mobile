# Background coverage during iPad rotation

Verified on 2026-09-11 using the iPad (A16), iOS 26.5 simulator and the native
development app. Native screenshots were inspected with CUA during rotation.

`ScreenBg` previously painted a rectangle sized from `useWindowDimensions`.
The native canvas could resize before JavaScript supplied the new rectangle,
leaving an uncovered strip at the right or bottom edge.

The background now uses Skia `Fill`. Its radial gradient follows the canvas's
`onSize` shared value through Reanimated derived values on the UI thread.

A temporary route rendered the actual component and a copy of the previous
implementation. A button held JavaScript busy for four seconds before rotating
the simulator with its native toolbar.

- Previous implementation: portrait-to-landscape exposed a right-hand strip;
  landscape-to-portrait exposed a bottom strip until JavaScript resumed.
- Updated home background: both rotations kept the canvas fully covered while
  JavaScript was busy, with the gradient following the new canvas dimensions.
- Updated default screen background: both rotations also retained full coverage.
- Returning to Home restored the normal screen with the updated background.
- `npm run typecheck`: passed, exit 0; full log at
  `/tmp/pray-background-rotation-final-typecheck.log`.
- `git diff --check`: passed, exit 0.

The temporary route and startup redirect were removed. No prayer was started,
answer saved or recording created for this check. The simulator app and Metro
were restarted after their development connection stopped responding.
Switching test canvases produced two Reanimated warnings about layout metrics
not yet being available; no rendering error appeared in the checked rotations.

Later on 2026-09-11, local Release 1.0.13 was built through `npm run iphone`
with the iPad's explicit device identifier and installed over Wi-Fi on the
iPad Pro 11-inch (M4), iPadOS 26.6.1. Build and installation exited 0;
`devicectl` confirmed version 1.0.13 and the running app process. The full
installation log is `/tmp/pray-ipad-wifi-install.log`.
Physical-device rotation, Android and Split View were not exercised by the agent.
