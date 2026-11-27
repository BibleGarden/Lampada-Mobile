# ADR-0045: On-demand before/after screenshots from emulators in GitHub Actions

- Status: Accepted
- Date: 2026-11-23
- Participants: product owner, developer

## Context

A visual change needs before and after screenshots for every affected platform
(`AGENTS.md`, "Visual changes"). Not everyone who prepares a pull request has a
Mac with Xcode, an iOS simulator and the Android emulator. The only workflow,
`ci.yml`, runs the type check and unit tests on `ubuntu-latest`. The repository
is public, and a preview builds the code of a pull request with the build
secrets (`EXPO_PUBLIC_*`).

## Decision

The workflow `preview-screenshots.yml` builds the pull request merge base
("before") and head ("after") for Android (`ubuntu-latest`, KVM, x86_64 Google
Play API 35 image, Pixel profile, 1280x2856 at 480 dpi) and iOS (`macos-26`,
`iPhone 17 Pro`, Release simulator build), runs Maestro flows that the request
names and posts one comment with inline images on the pull request.

- **Trigger.** On demand only: `workflow_dispatch` (write access) and the label
  `preview-screenshots` (triage access). Pull requests from forks are refused.
  `pull_request_target`, `issue_comment` and `push` are not used: they would let
  a commenter or a fork run code with secrets.
- **Jobs.** `plan` (no checkout), `android` and `ios` (PR code, read-only token,
  secrets only in the build steps) and `publish` (write access, no checkout,
  untrusted artifacts validated).
- **Request.** The pull request description names screens (`Preview screens:`)
  or the `screens` input does. A screen name is a pair of flows in
  `testing/preview/`; a path is an existing Maestro flow of the pull request
  head. Flows and scripts always come from the commit of the workflow run, flows
  named by path from the pull request head, so "before" runs the same flow as
  "after" even when the base lacks it.
- **Image hosting.** GitHub has no API to upload an image into a comment. The
  `publish` job pushes the PNG files to the branch `preview-images` and the
  comment refers to the `raw.githubusercontent.com` URLs of that branch. The
  images are also uploaded as workflow artifacts.

## Options considered

### Images on a dedicated branch (chosen)

Stable public URLs that render in a comment, the permission is only
`contents: write` for the token of the `publish` job, nothing leaves GitHub. The
branch is rewritten as one commit with the 40 newest runs, so it does not grow
without bound. Trade-off: the images are public, as is the repository.

### Release assets

Also stable URLs, but they need releases and clutter the release list, and the
token needs the same write permission.

### Artifacts only, or an external image host

Artifact URLs require authentication and do not render in a comment. An external
host adds a service, a credential and data leaving GitHub.

### `pull_request_target` or `issue_comment` triggers

Convenient (a comment starts a run), but they run in the context of the base
branch with secrets and write access, so any commenter or fork could run code
there. Rejected by the owner's requirement.

## Consequences

- A maintainer can get visual evidence for a pull request without a Mac; the
  owner still approves the change.
- Two repository secrets are required: `EXPO_PUBLIC_API_URL` and
  `EXPO_PUBLIC_AI_PROXY_KEY`. A missing one fails the run before any build.
- The emulator renders in software, so a preview shows how the app looks, not
  how smoothly it moves; a screen recording is still a local task.
- A change of the workflow cannot be run through `workflow_dispatch` before it
  is on `main`; labelling its own pull request, with `Preview target:` naming
  another pull request, shows it at work.

## References

- Issue BibleGarden/Lampada-Mobile#100 and #102
- `testing/README.md`, "Preview screenshots in CI"

## Amendment: cached builds and a build/capture split

The first version of the workflow built the app inside every capture job, and
the iOS build (Skia and the other pods compile from source) made most of the
run. The changes below keep the screenshots, the before/after meaning and the
security rules above, and replace the "Jobs" bullet:

- **Jobs.** `plan` (no checkout), `build-android` and `build-ios` (PR code,
  read-only token, the secrets only in the native build steps), `capture-android`
  and `capture-ios` (PR code and flows, read-only token, no secrets) and
  `publish` (write access, no checkout, untrusted artifacts validated).
  A build job produces the app for one variant (before or after); the capture
  jobs run a matrix of variant by chunk. A chunk is one screen or flow, with at
  most four chunks per platform and variant, so a preview of several screens
  boots several emulators or simulators in parallel. In a manual run the
  capture jobs are skipped and each build job captures its own screens after
  the build, with the same scripts and arguments and without secrets (see "The
  app is never cached in a scope that fork runs read").
- **App cache.** In a label run a build job stores the simulator `.app` or the x86_64 APK in the
  Actions cache under the app key `preview-app-<platform>-<app sha>-<digest>`.
  When the key exists, the build is skipped and the capture jobs restore the app
  from it. The digest covers everything that changes the built app: the lockfile,
  the toolchain of the runner (Xcode and the iOS SDK and CocoaPods for iOS; Java,
  the SDK build tools, NDK and CMake for Android; the Node major version), the
  build scripts of `scripts/preview/` (`app-key.sh` lists them) and one hash over
  the secret values baked into the app (`EXPO_PUBLIC_API_URL`,
  `EXPO_PUBLIC_AI_PROXY_KEY`). The `plan` job makes that hash from both values
  together, so the key and the logs hold no secret and the API URL cannot be
  recovered from the hash (the proxy key is not guessable). A new baked-in
  secret must be added to that hash in `plan`, in the same change. Each build job writes the
  components of the key to its job summary, so two runs show which input made
  the key miss.
- **Native build caches** (only when the app key misses; saved only by a label
  run, see "Nothing is saved from a run whose cache scope fork runs read"): CocoaPods (`ios/Pods`
  and `ios/Podfile.lock`, keyed by `package-lock.json`, `app.json`, `plugins/`,
  `patches/`, `modules/`, the toolchain and the build scripts, because `ios/`
  and `android/` are generated by `expo prebuild` and have no committed lock
  file); Xcode's own compilation cache (Xcode 26, `COMPILATION_CACHE_*`, one
  entry per Podfile key, found by content, so an older entry still serves a
  later one); and the Gradle caches with the Gradle build cache for Android
  (one entry per set of dependency inputs). React Native's ccache wrapper
  (`USE_CCACHE`) is not used: Xcode's build system does not call the compiler
  through the `CC` build setting. DerivedData is not cached: with it restored,
  Xcode still plans and replays every target, so it does not shorten the build.
- **The app does not travel as a workflow artifact.** The app bundles the
  `EXPO_PUBLIC_*` values from the repository secrets, and the artifacts of a
  public repository can be downloaded by anyone who is signed in. The screenshots
  stay artifacts: they hold no secret.
- **Cache scoping.** A cache entry is readable by runs of the same ref and of
  the base branch, and an existing key cannot be overwritten. Runs for pull
  requests from forks read the `main` scope too: GitHub lets a pull request run
  restore the caches of its base branch, including for forks, and `ci.yml` runs
  on every pull request with the workflow file of that pull request, so a fork
  can restore any `main` entry whose key it knows or guesses by prefix. A run
  started by the `preview-screenshots` label runs on the merge ref of the
  labelled pull request, so it writes to that pull request's scope, which no
  other pull request reads. A `workflow_dispatch` run runs on `main`, whose scope
  every pull request, forks included, reads.
- **Nothing is saved from a run whose cache scope fork runs read.** Anything a
  build produces with the build secrets may carry them, and not only the app:
  the Gradle build cache holds outputs of cacheable tasks such as the compressed
  assets with the JavaScript bundle (`EXPO_PUBLIC_*` values inlined) and the
  merged manifest (the API URL). So a manual run, which runs on `main`, saves no
  cache entry at all: no app, no CocoaPods, no compilation cache, no Gradle
  caches. It restores the native caches it finds and always builds the app, and
  its build jobs capture the screens themselves instead of handing the app to
  capture jobs. A label run saves the app and the native caches only in the
  scope of its pull request, so they are reused within that pull request (a
  repeated preview, or the "before" app of the next commit with the same merge
  base), not across pull requests: the first labelled preview of a pull request
  builds both apps with cold native caches.
- **A cache written while building PR code cannot replace the app of another
  SHA.** The key of an app contains the full SHA that the job checked out, and
  it is computed by a step that runs before any PR code, as a step output that
  later steps cannot change. In a manual run the workflow and `scripts/preview/`
  are those of `main`. In a label run they come from the labelled pull request
  itself (its merge ref), so that step is only as trustworthy as that pull
  request; this is harmless because a label run writes only to the scope of its
  own pull request, which only that pull request reads, so it can poison nothing
  else. A manual run saves nothing, and the first entry written for a key stays
  (keys are immutable). What remains in a manual run, which builds the code of
  the target pull request with the workflow of `main`: PR code that runs in a
  job can reach the cache token of that job and could write an entry of its own
  into the `main` scope. That needs a branch of this repository (forks are
  refused), so an author with write access, and a maintainer who starts the run;
  the same person could already read the build secrets with a workflow of their
  own branch. The capture jobs only read the cache.
- **Cache budget.** The repository limit is 10 GB with least-recently-used
  eviction. Only label runs write, each into its own pull request's scope: the
  native caches once per set of inputs and two apps per platform and previewed
  commit, and the least recently used entries leave first. The Gradle caches
  are the largest entry; if the budget is exceeded, the Gradle build cache
  directory is the first candidate to drop, after measuring the Android build
  with and without it.
