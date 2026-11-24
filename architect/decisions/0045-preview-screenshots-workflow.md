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
