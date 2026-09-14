# Scripture text colours

Date: 2026-09-13. Installed version: 1.0.16.

Key verses now use the compact card's `colors.cardText` off-white. Surrounding
verses use the same colour at 75% opacity. The narration underline is translucent
white. Passages without a key-verse range remain at full opacity. The shared
renderer applies this to the reader, favourites and journal (SCR-019).

`npm run typecheck` passed with exit 0. This styling-only change adds no unit
tests. Visual comparison of an expanded passage has not been completed.

`npm run iphone`, with `DEVICE` selecting the physical iPad Pro 11-inch (M4),
built and installed standalone Release 1.0.16 with exit 0. Runtime preflight
passed, and both required runtime values were verified in the embedded bundle
without printing them. Xcode reported `BUILD SUCCEEDED` with dependency and
bundler warnings. `devicectl device info apps` confirmed version 1.0.16, and
`devicectl device info processes` confirmed the main Lampada process running.
