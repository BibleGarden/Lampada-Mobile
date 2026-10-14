# ADR-0044: Automatically submit Android production builds to internal testing

- Status: Accepted
- Date: 2026-10-14
- Participants: product owner, developer

## Context

ADR-0040 configured Play submissions as internal drafts. The owner has now
assigned an EAS service account key with permission to release to Lampada's
testing tracks only. The owner needs an installable internal release after each
Android production build, before promoting that release to closed testing.

## Decision

Android production builds use EAS `--auto-submit`; the submit profile targets
the `internal` track with `releaseStatus: completed`. The owner checks the
release on a phone, then copies it to the closed track in Play Console. An
`all` invocation builds Android with auto-submit and then iOS without it,
reserving the store version only once. iOS builds do not auto-submit.

The service account key is stored in the EAS account and assigned to
`app.lampada`; it is not kept in the repository. This replaces ADR-0040's
internal-draft submission choice.
