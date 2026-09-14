# Physical iPad installation: Lampada 1.0.22

Date: 2026-09-14
Device: iPad Pro 11-inch (M4), iPadOS 26.6.2
Source: consolidated local main at `7bb5259`

Built and installed the standalone Release with `npm run iphone`, setting
`DEVICE` to the connected iPad. The local environment preflight passed and the
build used `.env.local`. The script advanced the application version from
1.0.21 to 1.0.22. No EAS build or server change was involved.

Xcode reported `BUILD SUCCEEDED`, and device installation succeeded. Native
dependency and Hermes bundle warnings were present; the full log was retained
and diagnostics classified. `devicectl device info apps --bundle-id twinkler`
confirmed Lampada 1.0.22 installed on the iPad. The built application includes
an embedded JavaScript bundle containing both interface-language metadata and
prefetch policy handling.

Automatic launch was denied because the iPad was locked. Installation is
verified, but launch and visual checks were not completed. The deployment
script suppresses launch failures, so its exit 0 alone was not used as launch
evidence. The user can open Lampada after unlocking the iPad.

The consolidated application code had already passed 212 Node tests and
TypeScript checking; this installation changed only the version and evidence.

Evidence: [installation verification](../evidence/2026-09-14-ipad-release/installation.json).
