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

- **Android application id `app.lampada`.** `android.package` changes from
  `com.nf404.twinkler` to `app.lampada` before the first Google Play
  publication, while the id can still change: Play binds an app to its id
  forever, and the old one is built from the Expo account `nf404` and the
  working name `twinkler` rather than the product name. The iOS bundle
  identifier stays `twinkler`: the App Store app is published, and a new
  bundle identifier would be a new App Store app. Android flows, runner
  scripts and the test probe target `app.lampada`; a unit test rejects the old
  id anywhere in the app code, scripts and Android flows.
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
  for `app.lampada`, never in the repository, so the profile has no
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

- **Android Auto Backup carries the journal.** `android.allowBackup` is not
  set in `app.json`, so Expo's default `true` applies. The owner decided not to
  exclude the journal: losing every prayer on a device change is a real harm,
  while the risk is low. Any `<include>` rule limits the backup to the listed
  paths, and the rules written by `expo-secure-store` include only
  `sharedpref`, which left the database out. `plugins/withAndroidBackupRules.js`
  writes the app's own rules instead, and `expo-secure-store` runs with
  `configureAndroidBackup: false`:

  | App storage path | Cloud backup | Device-to-device transfer |
  |---|---|---|
  | `files/SQLite/` (`lampada.db` with its WAL files) | only end-to-end encrypted | yes |
  | `files/Audio/` (voice recordings) | no | yes |
  | everything else | no | no |

  "Everything else" covers the diagnostics log and all SharedPreferences,
  `SecureStore.xml` included: with any `<include>` present, an unlisted path is
  never copied, and lint (`FullBackupContent`, fatal in release builds) rejects
  an `<exclude>` outside the included paths. Reminders are rescheduled from the
  journal settings at every start. The rules per Android version:
  - Android 12 and higher: `xml/lampada_data_extraction_rules.xml`, with
    `disableIfNoEncryptionCapabilities="true"` on `cloud-backup`.
  - Android 9–11: `xml-v28/lampada_backup_rules.xml`. The journal is listed
    twice, with `requireFlags="clientSideEncryption"` for the cloud and
    `requireFlags="deviceToDeviceTransfer"` for a transfer; recordings once,
    with the transfer flag.
  - Android 7–8.1 have neither client-side encryption nor `requireFlags`, so
    `xml/lampada_backup_rules.xml` excludes every app directory and nothing is
    backed up or transferred there.
  - **Recordings stay out of the cloud backup.** Google keeps 25 MB per app and
    stops backing up an app entirely while its data exceeds the quota.
    Recordings at 48 kbit/s take about 22 MB per hour, so they would soon cost
    the journal its backup. A device transfer has no quota and carries them.
  - **The cloud backup is end-to-end encrypted.** Android encrypts it with a
    client-side secret only when the device has a screen lock (PIN, pattern or
    password). Without one the journal stays out of the cloud backup on every
    Android version and moves only with a device transfer.
  - **The PIN is not restored.** SecureStore values are encrypted with an
    Android Keystore key that never leaves the device, so a restored copy could
    not be decrypted. The lock keys live only in SecureStore (`lib/lock.ts`),
    and a missing record means protection off (`parseLockConfig`), so a
    restored journal opens without the lock until the user sets a PIN again.
  - Backup to the user's own Google account is not data collection by the
    developer (Play Console Data safety).

## Options considered

### Keep `com.nf404.twinkler` on Android

It matches neither the product name nor the iOS bundle identifier `twinkler`,
and the Play listing URL would keep it forever. Rejected while the app is not
yet published on Play.

### Bump the version only when it still has a patch

The script would reuse a two-part version automatically. After a release that
went straight from `1.4` to the next production build, both platforms would
silently reuse a version that is already live. Rejected in favour of the
explicit `--keep-version`.

### Choose the store URL on the client

An Android build could replace the App Store URL with a Play URL. This splits
the update policy between two repositories and still shows iOS thresholds to
Android. Rejected.

### Exclude the journal from Auto Backup

`allowBackup: false` would keep the journal off Google's servers, but a new
phone would start with an empty journal and no way to bring the prayers back.
Rejected: the backup is encrypted and belongs to the user.

### Back up recordings to the cloud

The journal would come back with its audio. Rejected: recordings outgrow the
25 MB quota, and an app over the quota loses its whole cloud backup, journal
included.

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
- A journal restored from the cloud keeps its texts and transcripts, but not
  the audio: the journal keeps each recording row with its transcript, marks
  it "Audio is not on this device", disables playback and transcription, and
  writes `recording_audio_missing` to the diagnostics log (TEST_PLAN JRN-009).
  A device transfer on Android 9 and higher brings the recordings too.
- A restored journal has no app lock until the PIN is set again.
- A phone without a screen lock, or on Android 7–8.1, has no cloud backup of
  the journal.
- The rules name native directories: `androidBackupRules.test.mjs` fails if an
  Expo upgrade moves the SQLite or recordings directory or renames the
  SecureStore preferences file. `:app:lintVitalAnalyzeRelease` validates the
  rule files in every release build. Backup and restore are checked manually
  (TEST_PLAN JRN-015, JRN-016) before the "journal survives a device change"
  claim is published.
- The first Android upload may be done manually in Play Console; Play Console
  declarations, store graphics and screenshots remain owner tasks.

## References

- Expo SDK 57: [splash screen](https://docs.expo.dev/versions/v57.0.0/sdk/splash-screen/),
  [app config](https://docs.expo.dev/versions/v57.0.0/config/app/),
  [EAS Submit for Android](https://docs.expo.dev/submit/android/),
  [SecureStore Android Auto Backup](https://docs.expo.dev/versions/v57.0.0/sdk/securestore/)
- Android: [Auto Backup](https://developer.android.com/identity/data/autobackup),
  [testing backup and restore](https://developer.android.com/identity/data/testingbackup)
- Amends ADR-0020 and ADR-0034
