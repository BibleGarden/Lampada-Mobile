# ADR-0040: Release on Google Play alongside the App Store

- Status: Accepted
- Date: 2026-10-10
- Participants: product owner, developer

## Context

Lampada shipped only to the App Store. Before the first Google Play release the
repository had iOS-only assumptions: the production build script always built
iOS and reserved a new store version on every run, so a later Android build of
the same release would have received the next minor. The update check did not
tell the server which store the installation came from, and the server returns
one App Store URL. Android started on Expo's default white splash screen with a
placeholder grid, the final manifest kept template permissions the app does not
use, and biometric texts named Face ID and Touch ID on Android.

## Decision

- **One store version per release.** `scripts/build-production.sh` takes a
  required platform: `android`, `ios` or `all` (`npm run eas:production:<platform>`).
  It reserves the next minor once (ADR-0034); `all` builds both platforms from
  that version. `--keep-version` builds one platform of an already reserved
  release (the other platform, or a retry after a failed build); it fails
  unless `expo.version` is a two-part store version and is refused with `all`.
  Native build numbers stay with EAS: `appVersionSource: remote` and
  `autoIncrement` manage the iOS build number and the Android `versionCode`
  independently.
- **Submission.** `eas.json` `submit.production.android` uploads to the
  `internal` track with `releaseStatus: draft`; the owner promotes releases in
  Play Console. The Google service account key is stored in EAS credentials
  for `com.nf404.twinkler`, never in the repository, so the profile has no
  `serviceAccountKeyPath`.
- **Platform-aware update check.** The client sends `platform=ios|android` and
  accepts only responses that echo the same `platform`. A response without it
  comes from a server that does not distinguish stores and is ignored like any
  other unrecognized response (ADR-0020). Every ignored check writes its reason
  to the local diagnostics log, so a server without `platform` is visible
  instead of silently disabling updates. The client never builds a store URL
  itself; the server owns per-platform thresholds, switches and URLs.
- **Splash screen.** `expo-splash-screen` shows the app background `#0e0a07`
  with the flame on both platforms. `assets/splash.png` is `assets/icon.png`
  with a radial alpha fade (opaque to 70 % of the half-width, transparent from
  96 %, smoothstep), so the icon's own dark square blends into the background
  and the Android 12+ circular icon mask does not reveal an edge. The file is
  800 px (the xxxhdpi size of a 200 dp image), palette-quantized with
  libimagequant (quality 80–100, full dithering). The splash stays until the
  root layout has its fonts and interface language, so no empty frame appears
  between the flame and Home.
- **Permissions.** `android.blockedPermissions` removes `SYSTEM_ALERT_WINDOW`,
  `READ_EXTERNAL_STORAGE` and `WRITE_EXTERNAL_STORAGE`: the app keeps its files
  in app storage and shares prayers as text.
- **Biometric names.** Face ID and Touch ID are named only on iOS, inside the
  shared templates. Android has a complete phrase per method and place (label,
  system prompt title, enable error, lock screen hint and button) in every
  interface language, because a common noun does not fit the `{name}`
  templates grammatically. Android names face or fingerprint only when the
  system reports exactly one biometric type; otherwise the system prompt
  chooses among enrolled methods and the app says "biometrics".

## Options considered

### Bump the version only when it still has a patch

The script would reuse a two-part version automatically. After a release that
went straight from `1.4` to the next production build, both platforms would
silently reuse a version that is already live. Rejected in favour of the
explicit `--keep-version`.

### Choose the store URL on the client

An Android build could replace the App Store URL with a Play URL. This splits
the update policy between two repositories and still shows iOS thresholds to
Android. Rejected.

### Keep the template splash and icon assets

Android would keep the white placeholder splash. Rejected; the unused template
assets were deleted.

## Consequences

- Release builds are run per platform or for both at once; the version stays
  shared.
- Update notices on Android, and on iOS builds from this version on, stay off
  until Bible-API returns `platform`. The Bible-API change is a prerequisite
  for the first store build of this client. Older iOS builds do not send
  `platform` and must keep receiving iOS decisions.
- The splash image is derived from the icon; regenerate it with the same fade
  if the icon changes.
- The first Android upload may be done manually in Play Console; Play Console
  declarations, store graphics and screenshots remain owner tasks.

## References

- Expo SDK 57: [splash screen](https://docs.expo.dev/versions/v57.0.0/sdk/splash-screen/),
  [app config](https://docs.expo.dev/versions/v57.0.0/config/app/),
  [EAS Submit for Android](https://docs.expo.dev/submit/android/)
- Amends ADR-0020 and ADR-0034
