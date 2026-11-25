# PR store testing

`store-testing.yml` builds the exact head SHA of an open PR and requests EAS
auto-submission to TestFlight and Google Play internal testing before merge.
It accepts only branches of this repository; forks are refused.

## Setup

- Repository secret `EXPO_TOKEN`: the `nf404` robot token. Signing credentials,
  the Play service account key and App Store Connect API key stay in EAS.
- Repository variable `STORE_TESTING_VERSION`: the authoritative store version
  as `major.minor.patch`, for example `1.5.0`. The maintainer sets it to at least
  the latest version on either store and advances it when the stores require a
  new version. Do not derive it from the patch counter in `app.json` or from an
  unauthenticated store lookup. A missing or malformed value fails the run.
- EAS environment `preview`: `EXPO_PUBLIC_API_URL` and
  `EXPO_PUBLIC_AI_PROXY_KEY` must be configured and pass the runtime preflight.
  This environment already serves hosted test builds against the production
  API; the new profile reuses those values. No runtime GitHub secrets or
  `.env.local` upload are needed.
- The `store-testing` PR label is managed by the repository maintainer.

The `store-testing` build profile has `distribution: store`,
`EXPO_PUBLIC_BUILD_CHANNEL=test` and `autoIncrement: true`. Its matching submit
profile targets iOS app `6806024678` and Android track `internal` with
`releaseStatus: completed`. The production profiles and npm commands retain
their own behavior.

## Run and accept

After green CI and approved review, the implementer adds the `store-testing`
label to the PR, or runs `store-testing.yml` from Actions with its PR number.
For another label-triggered run, remove and reapply the label. Manual dispatch
becomes available once the workflow is on the default branch; the label can
exercise the workflow on its own PR before merge.

The workflow checks out the resolved head SHA, replaces `expo.version` only in
that disposable checkout, then runs:

```sh
eas build --platform all --profile store-testing --non-interactive --auto-submit --wait --json
```

EAS owns `ios.buildNumber` and Android `versionCode` through
`appVersionSource: remote` and auto-increment. Repeated builds can share the
store version but receive new native build numbers. No version change is
committed to `app.json`.

The run summary and a separate PR comment list the version, exact SHA, iOS and
Android build numbers and EAS build links; the raw JSON is a workflow artifact.
Build completion and an auto-submit request do not prove store availability:
check EAS submission status and wait for TestFlight/Play processing. Resolve a
failed submission before handing the builds to a tester.

In the issue, the implementer records the branch, SHA, version, both build
numbers and links. The tester installs and checks exactly those builds. The
handoff to the owner names the same numbers. App changes require this delivery;
documentation-only and CI-only tasks do not.

Play internal testing exposes the latest release. Parallel PRs can replace
each other's releases; at the owner's request, start `store-testing.yml` again
and record the new numbers. Runs are serialized per PR without canceling an
in-flight build or submission; different PRs can run concurrently. GitHub
concurrency retains at most one pending run per PR.

## Security

The workflow uses only `workflow_dispatch` and `pull_request: labeled`, with
file-level `permissions: {}`. Maintainers review the PR code before requesting
distribution: build scripts execute with the EAS token. The validation job
executes no PR code. The build job has only `contents: read`, does not persist
checkout credentials and receives `EXPO_TOKEN` only in the preflight/build
step. The publishing job has only `pull-requests: write`, checks out no code,
validates the result artifact as data and generates the comment itself.
