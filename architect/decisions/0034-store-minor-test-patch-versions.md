# ADR-0034: Raise the minor for store builds and the patch for test builds

- Status: Accepted
- Date: 2026-09-26
- Participants: product owner, developer

## Context

ADR-0024 raised the patch on every build, so TestFlight received versions such
as `1.0.26`. The owner wants App Store and TestFlight versions with two
components, while local and internal test installations stay distinguishable on
the About screen without advancing the store version.

## Decision

`scripts/bump-version.mjs` takes a required mode. `npm run eas:production`
passes `release`: the minor increases and the patch is dropped (`1.1.3` → `1.2`).
Local native builds and EAS preview pass `test`: the patch of the current store
version increases (`1.2` → `1.2.1` → `1.2.2`). The major remains manual. The
rest of ADR-0024 is unchanged: allocation precedes compilation, failed attempts
consume numbers, and EAS remote build numbers stay independent.

## Options considered

### Test builds keep the store version

Test installations would differ only by the native build number, which the
About screen and local builds would have to start managing. Rejected as a larger
change with less visible identification.

### Every build raises the minor

Local installations would advance the store version quickly. Rejected.

## Consequences

- Store versions have two components; a test build shows which store version it
  follows.
- A failed production attempt consumes a minor version.
