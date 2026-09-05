# Application update checks

## Scope

Lampada checks its installed native version on root mount. The shared API uses
an application selector and echoes the selected app. Optional updates can be
dismissed for the current process; mandatory updates remain above navigation.
Both stay below PIN protection and the privacy curtain.

## Validation

- TypeScript: passed, exit 0.
- Client contract/network tests: 2 passed, exit 0. Includes soft/hard/none,
  unsafe and wrong-application responses, request parameters and offline mode.
- Bible-API version/About tests: 18 passed, exit 0.
- iOS Simulator: optional update dismissal and navigation passed; mandatory
  update without a Later action and persistence across a settings deep link
  passed. Optional handling of iOS's Open confirmation may report a benign
  missing-element warning when iOS does not show the prompt.
- The existing PIN screen took precedence in the owner's simulator. Remaining
  UI checks used a separate empty simulator without changing the owner's data.

The UI flows require the app to be running against a stub returning the selected
`soft` or `hard` response, `app: lampada`, a valid HTTPS store URL and localized
message. Set the existing Scripture URL environment override to the stub origin
in the test Metro process, then cold-launch between modes. No production policy
was enabled and no store installation was attempted.

## Release

Server PR: https://github.com/BibleGarden/Bible-API/pull/4

Lampada notifications remain disabled until App Store listing 6806024678 is
public. Activate the policy and set thresholds through the API's constants,
then deploy. Android Back interception is implemented but was not exercised on
an Android device. Native builds must include the explicit expo-application
dependency. npm installation reported existing dependency audit findings
(13 moderate, 5 high) and an allow-scripts warning for Skia; these are outside
this change's dependency update scope.
