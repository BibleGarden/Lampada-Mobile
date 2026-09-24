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

# Git workflow

- Start changes on a branch from the latest `main`. Never commit or push
  directly to `main`, including version bumps and other mechanical changes.
- Submit every change through a PR. Review the final branch revision and
  address actionable findings before asking the owner to approve the merge.
- Give the owner the PR link, check results, and remaining risks. Do not merge
  the PR, enable auto-merge, or otherwise put its changes into `main` until the
  owner explicitly approves merging that PR. Approval to do the work or open
  the PR is not merge approval.
- After an approved merge, update local `main` and remove the merged local
  branch and any worktree after checking for uncommitted or unmerged changes.

# Testing changes

- When app behavior changes, update the applicable unit tests, Maestro flows,
  and expected results in `testing/TEST_PLAN.md` in the same PR. Add coverage
  for changed behavior that has none.
- Before opening a code PR, run `npm run typecheck` and `npm test`. A docs-only
  PR does not need these checks.
- Run affected Maestro scenarios on a build from the PR branch. Run
  `npm run test:e2e:critical` for every new build. Run the full `main` and
  `rare` tiers, ordered suites, and manual checks for release acceptance or
  when the change directly affects them.
- Save each full command log and exit code as a PR or task artifact accessible
  to reviewers, and identify the tested commit and build. Put only selected
  final evidence in `testing/evidence/` as described in `testing/README.md`.
  Investigate and report failures; never rerun a failed test or CI job without
  the owner's explicit permission.

# Simulators

Reuse the existing named simulators; do not create new ones or boot the stock
Xcode devices. Every simulator with an installed build takes several GB, and
the disk has already filled up once. If a named simulator is missing, create it
with the same name and device type. Scripts resolve a simulator by name with
`testing/e2e/sim-udid.sh "<name>"`; do not hardcode UDIDs.

| Simulator | Device type | Use |
|---|---|---|
| `Pray Smoke iPhone 17 Pro` | iPhone 17 Pro | default for Maestro tiers (`critical`, `main`, `rare`) and anything needing a Home Indicator or the Dynamic Island |
| `Pray SE` | iPhone SE (3rd generation) | small screen and Home button; quick manual checks; `run-lock-biometrics.sh` |
| `Pray iPad2` | iPad Pro 11-inch (M5) | tablet and rotation flows (`npm run test:e2e:ipad`) |
| `Lampada AppStore UK iPhone 17 Pro Max`, `Lampada AppStore iPad Pro 13` | — | App Store screenshots only |

Shut a simulator down when you are done with it.

# Builds and environments

- Never substitute the build method silently. A request to install the app on a
  physical iPhone means `npm run iphone` — a local standalone Release build that
  takes its variables from `.env.local`.
- `preview` is a separate internal Ad Hoc EAS build, not a synonym for the local
  Release. It receives variables only from the EAS `preview` environment;
  `.env.local` is never uploaded to the cloud.
- Always run `npm run env:check:preview` before any EAS preview build. Start the
  build itself through `npm run eas:preview`, not through a bare `eas build`.
- Required runtime variables: `EXPO_PUBLIC_API_URL` (server origin only) and
  `EXPO_PUBLIC_AI_PROXY_KEY`. Endpoint paths are defined in `lib/apiConfig.ts`;
  do not add separate URL variables for individual API methods.
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
