# General rules

- Before changing the app, read the documentation for Expo SDK 57 specifically:
  https://docs.expo.dev/versions/v57.0.0/.
- Everything written into the repository is in English: commit messages (as
  Conventional Commits, `feat(session): add music crossfade`), documentation,
  README files, ADRs and test reports. Russian stays the language of the
  conversation with the owner and of the comments inside the code.
- Keep `testing/` limited to scenarios, Maestro flows, reports and final
  evidence.
- Keep the code and the architecture documentation in sync: when the actual
  architecture changes, update `architect/README.md` in the same change, and
  record a new significant architectural decision as an ADR in
  `architect/decisions/`.

# Builds and environments

- Never substitute the build method silently. A request to install the app on a
  physical iPhone means `npm run iphone` — a local standalone Release build that
  takes its variables from `.env.local`.
- `preview` is a separate internal Ad Hoc EAS build, not a synonym for the local
  Release. It receives variables only from the EAS `preview` environment;
  `.env.local` is never uploaded to the cloud.
- Always run `npm run env:check:preview` before any EAS preview build. Start the
  build itself through `npm run eas:preview`, not through a bare `eas build`.
- Required runtime variables: `EXPO_PUBLIC_AI_PROXY_URL`,
  `EXPO_PUBLIC_AI_PROXY_KEY`, `EXPO_PUBLIC_AI_TRANSCRIBE_URL`.
  `EXPO_PUBLIC_SCRIPTURE_SELECT_URL` is optional: the Scripture URL is derived
  from `AI_PROXY_URL`.
- If the preflight check fails, do not start the build. First state explicitly
  which names are missing and configure the chosen environment; never print the
  values of the variables into a response or a public log.
- `development` requires `expo-dev-client` to be installed deliberately; do not
  pick that profile automatically. `production` is meant for the App Store and
  is not used for installing directly onto a phone.
- A fallback question together with a quote "from the saved ones" in an
  installed build should first be diagnosed as missing build-time
  `EXPO_PUBLIC_*` variables, rather than as a different API URL.
- After changing EAS variables, a new EAS build and a fresh install are
  mandatory: an already built JS bundle will not pick the variables up.
