# ADR 0026: Identify test installations independently of Debug/Release

Status: Accepted

## Context

The owner needs to distinguish direct test installations from TestFlight and
App Store builds while keeping the app usable without a development server.
The previous About footer used `__DEV__`, which hid the distinction in local
standalone Release builds.

## Decision

Always show the installed version. Show a localized "Test build" label and the
API origin only when the bundled `EXPO_PUBLIC_BUILD_CHANNEL` equals `test`.
Local build and development commands set `test`; EAS development and preview
profiles set the same value explicitly. The production script and EAS profile
set `store` for TestFlight and App Store. Missing values hide test details.
The channel is selected by build commands/profiles rather than runtime settings
or the API environment. Never display the API key.

## Consequences

Local physical-device installs still use `npm run iphone`, `.env.local` and
standalone Release compilation. The label describes the intended distribution
channel, not the optimization mode or a runtime receipt check. Rebuilding is
required to change the bundled label. This replaces the debug-only footer
behavior described alongside ADR-0024 and ADR-0025.
