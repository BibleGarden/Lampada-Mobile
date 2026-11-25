# ADR-0046: Distribute PR builds through TestFlight and Play internal testing

- Status: Accepted
- Participants: product owner, developer

## Context

Acceptance of app changes needs installable builds of the reviewed PR revision
before merge. Local test versions do not necessarily match the versions already
published on the stores. The public repository must separate code execution
with build credentials from PR comment permissions.

## Decision

Use `store-testing.yml`, triggered manually with a PR number or by the
`store-testing` PR label. Refuse forks and build the resolved PR head SHA with
EAS Build and EAS Submit under `nf404`. The `store-testing` build profile uses
store distribution, the test channel and the EAS `preview` environment, which
already contains the runtime variables for hosted test builds. Its submit
profile targets TestFlight and completed Play internal releases.

Require the maintainer-managed repository variable `STORE_TESTING_VERSION`
as the authoritative version for both platforms. Apply it to `app.json` only
in the disposable checkout. EAS remotely increments the independent native
build numbers. This path does not use the local patch reservation from
ADR-0034; production builds retain their existing behavior.

Use empty default GitHub permissions, a PR-validation job without checkout, a
read-only build job with `EXPO_TOKEN` scoped to preflight/build, and a separate
comment job that executes no PR code and validates the EAS result artifact.
Publish version, SHA, build numbers and EAS links in the summary and PR comment.
Serialize runs per PR without interrupting an in-flight upload.

## Options considered

### EAS Build and Submit with an explicit store version (chosen)

Reuses signing, store credentials and remote build counters already in EAS.
An explicit store version avoids guessing from local patch versions or store
scraping. No additional repository secrets or release tooling are needed.

### Local patch reservation or automatic store lookup

The local patch counter can be behind the store version. Store lookup adds an
external dependency and cannot reliably define the intended release version.
Neither is used as a fallback.

## Consequences

- App-changing tasks require distribution after green CI and approved review.
  The issue and owner handoff identify the exact builds tested. Documentation
  and CI changes are exempt.
- Store processing and submission must be checked before acceptance; a finished
  EAS build alone is insufficient.
- Play internal testing contains the latest release. Parallel PRs overwrite
  each other; the implementer rebuilds at the owner's request.
- The maintainer keeps the version variable compatible with both stores.

## References

- [PR store testing](../../docs/store-testing.md)
- [ADR-0045: Preview workflow security](0045-preview-screenshots-workflow.md)
- [EAS auto-submit](https://docs.expo.dev/build/automate-submissions/)
