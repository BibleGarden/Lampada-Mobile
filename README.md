# Lampada

A prayer app built with Expo (SDK 57) / React Native.

The current shape of the project is described in
[`architect/README.md`](architect/README.md); the history of architectural
decisions lives in [`architect/decisions/`](architect/decisions/README.md).

## Development

```bash
npm install
npx expo start                                  # dev server + Metro
npx expo run:ios --device "iPhone 17 Pro"       # dev client in the simulator
```

The simulator needs `expo run:ios` specifically, not Expo Go: in Expo Go the app
crashes at import time (`Cannot find native module 'ExpoWidgets'` from
`lib/store.ts` -> `lib/prayerSystemTimer.ios.ts` -> `widgets/PrayerLiveActivity.tsx`).
The symptom is deceptive - an already running instance keeps living on Fast
Refresh and looks healthy, so the crash is only visible on a cold start. For
Maestro flows the `appId` of the custom build is `twinkler`, not
`host.exp.Exponent`.

## AI

AI requests go through `https://api.bible.garden/api/ai/question` to an existing
FastAPI service. Requests contain `topic`, `stage` (`first`, `next`, `reflect`) and
`messages` (chronological assistant/user turns); responses
remain `{ "text": "..." }`. See [ADR-0019](architect/decisions/0019-structured-question-history.md).
It routes each stage to a company-hosted model; neither model
configuration nor system instructions are embedded into the app. To enable AI,
copy `.env.example` to `.env.local` and set the client `X-API-Key` of the service.
That client key is visible in the built app and does not replace the server-side
limits. Voice answers are sent only when "Transcribe" is pressed, as a separate
request to `/api/ai/transcribe`. All requests use the server origin configured
in `EXPO_PUBLIC_API_URL`; endpoint paths are defined in `lib/apiConfig.ts`.

> The app uses native modules that Expo Go does not have
> (`@shopify/react-native-skia`, `react-native-reanimated` 4). Running it on a
> device therefore requires a custom build (see below), not the Expo Go app.

## Running locally on an iPhone

The project runs on a physical iPhone through a custom **Release** build: it
works standalone, without Metro and without Expo Go. The app is signed with the
paid team **Maria Novikov** (`4SC2JCE37N`), so it stays on the phone for about a
year.

### Build methods and variables

| Method | Purpose | Source of `EXPO_PUBLIC_*` |
| --- | --- | --- |
| `npm run iphone` | Local Release build installed directly onto a connected iPhone | `.env.local` |
| `npm run eas:preview` | Internal Ad Hoc EAS build for registered devices | EAS environment `preview` |
| `npm run eas:production` | Publishing through the App Store | EAS environment `production` |

`preview` does not read `.env.local`: that file is excluded from git and from the
cloud archive. Before a preview build the command checks automatically that the
required variables `EXPO_PUBLIC_API_URL` and `EXPO_PUBLIC_AI_PROXY_KEY` are
present and that the URL is a valid HTTP(S) origin. Set the same two names in
each EAS environment used for builds.

```bash
npm run env:check:local     # check the local Release build
npm run env:check:preview   # check the variable names in EAS preview
npm run eas:preview         # preflight + internal EAS build
```

If an installed build shows a fallback question together with an "from the saved
ones" caption, check the build environment first: this is the typical sign that
the URL or the key were not baked into the JS bundle. After changing EAS
variables an old `.ipa` will not fix itself - it has to be rebuilt and
reinstalled.

### API configuration

Set `EXPO_PUBLIC_API_URL=https://api.bible.garden` (an origin only, without
`/api` or an endpoint path). Local HTTP origins with a port are supported for
emulators. The limited client key remains `EXPO_PUBLIC_AI_PROXY_KEY`.
`lib/apiConfig.ts` defines paths for questions, transcription, Scripture,
catalogs, audio, contacts and version checks. About displays the normalized
base origin in test builds.

When migrating an existing environment, replace `EXPO_PUBLIC_AI_PROXY_URL`,
`EXPO_PUBLIC_AI_TRANSCRIBE_URL` and `EXPO_PUBLIC_SCRIPTURE_SELECT_URL` with
`EXPO_PUBLIC_API_URL`; keep the key unchanged. Legacy endpoint variables are
no longer read. Migrate EAS preview/production environments before their next
build, then rebuild and reinstall. A local `.env.local` change requires
restarting Metro for Debug and rebuilding for Release.

### Automatic app versions

`app.json` → `expo.version` is the source of the app version. Each invocation of
`npm run iphone`, `npm run ios`, `npm run android`, `npm run eas:preview` or
`npm run eas:production` reserves the next patch before building:
`1.0.0` → `1.0.1` → `1.0.2`. The major and minor numbers remain manual.
Required environment checks run before reserving a version for iPhone and EAS
builds. A later failure consumes the number; gaps are expected.

The About screen reads the installed native version, with a config fallback for
web and Expo Go. Local build commands synchronize native configuration before
compilation. EAS receives the incremented config in its source archive.
EAS remote build numbers are separate from this user-facing patch version;
the existing production build-number auto-increment remains enabled.

Run builds sequentially from one checkout and preserve the updated `app.json`
in version control before switching machines or checkouts. Direct Xcode,
Gradle, `expo run:*` and `eas build` invocations bypass the version reservation;
use the npm commands above. `npm start`, web development and hot reload do not
increment the version. The package version is package metadata only.

Debug builds (`npm run ios` / `npm run android` by default) provide development
tools and use Metro. Release builds bundle JavaScript and use production
optimizations. `npm run iphone` and EAS preview build Release; preview uses
internal Ad Hoc distribution, while production targets the App Store.
The About footer always shows the installed version. Local native installs and
EAS preview additionally show a localized "Test build" label and the configured
API origin (or `—` when absent). TestFlight/App Store builds from the production
profile show only the version. The API key is never rendered.

This distinction uses `EXPO_PUBLIC_BUILD_CHANNEL`, not `__DEV__`. Local scripts
and development/preview EAS profiles set it to `test`; the production script and
profile set it to `store`. It is selected automatically, so do not add it to
`.env.local` or the EAS environment. An absent value hides test details. Local
physical-device installs remain standalone Release builds without Metro.

### Requirements

- **macOS + Xcode** (an iOS build is only possible on a Mac).
- An Apple ID with access to team `4SC2JCE37N` signed in under
  Xcode -> Settings -> Accounts.
- The iPhone connected **by cable**, unlocked, and trusting the computer.
  On iOS 16+ enable Developer Mode:
  *Settings -> Privacy & Security -> Developer Mode*.

### First run

```bash
npm install
npm run iphone
```

The `scripts/deploy-iphone.sh` script does the rest by itself:

1. checks the required variables in `.env.local`;
2. reserves the next patch version;
3. synchronizes the `ios/` folder through `expo prebuild`;
4. syncs CocoaPods with the installed Expo modules;
5. finds the connected iPhone (the UDID is detected automatically) and sets the signing team;
6. builds Release, installs the app and launches it.

The first build is slow (5-20 min: compiling Skia, Hermes and so on), later ones
are faster. The phone has to stay unlocked during the installation and the first
launch.

### Running after changes

After changes to TypeScript, to assets or to the native configuration, run again:

```bash
npm run iphone
```

After the `bundleIdentifier` was changed to `twinkler`, the first new build
installs as a separate app and does not inherit the local data of the previous
installation. Later builds with the same identifier install over it and keep the
data. There is no need to run `npm start` separately: it brings up Metro, while
an installed Release build uses its bundled JS.

### Overriding through the environment

```bash
DEVICE=<udid> npm run iphone                   # a particular phone
TEAM=<teamId> BUNDLE=<id> npm run iphone       # another account or app
```

### Notes

- Installation works **over a cable only** (`devicectl` over the air does not
  install in this setup).
- The `ios/` folder is in `.gitignore` - it is generated by `expo prebuild` and
  is not committed.
- If the icon, the permissions or the plugins in `app.json` were changed, run
  `npx expo prebuild -p ios` before building (the script will then restore the
  correct signing team itself).
- Do **not** use `npx expo run:ios` directly: it picks the first certificate it
  finds and someone else's signing team. Builds go through `npm run iphone`.

### If the build does not see the iPhone

- Check the cable, the unlocked screen, trust for the computer and that
  Developer Mode is on.
- List the available devices with `xcrun xctrace list devices`.
- The error `iOS <version> is not installed` means the current Xcode does not
  support the iOS version on the phone. Update Xcode or install the platform
  under **Xcode -> Settings -> Components**, then repeat `npm run iphone`.
- A signing error usually means that **Xcode -> Settings -> Accounts** has no
  account with access to team `4SC2JCE37N`, or that the certificate has expired.
