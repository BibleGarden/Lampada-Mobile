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
FastAPI service. It holds the Google AI Studio key and calls Gemini; neither the
Google key nor the system instructions are embedded into the app. To enable AI,
copy `.env.example` to `.env.local` and set the client `X-API-Key` of the
service. That client key is visible in the built app and does not replace the
server-side limits. Voice answers are sent only when "Transcribe" is pressed, as
a separate request to `/api/ai/transcribe`; the URL is set through
`EXPO_PUBLIC_AI_TRANSCRIBE_URL` or derived from the `/api/ai/question` URL.

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
| `eas build --profile production` | Publishing through the App Store | EAS environment `production` |

`preview` does not read `.env.local`: that file is excluded from git and from the
cloud archive. Before a preview build the command checks automatically that the
required variables are present. A separate `EXPO_PUBLIC_SCRIPTURE_SELECT_URL` is
not required - the Scripture API address is derived from
`EXPO_PUBLIC_AI_PROXY_URL`.

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
2. finds the connected iPhone (the UDID is detected automatically);
3. generates the `ios/` folder through `expo prebuild` if it is missing;
4. syncs CocoaPods with the installed Expo modules;
5. sets the signing team;
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
