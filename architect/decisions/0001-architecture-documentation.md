# ADR-0001: Keep the architecture documentation in the repository

- Status: Accepted
- Date: 2026-08-23
- Participants: product owner, project team

## Context

The project had no single short description of the current architecture and no
permanent place to record the reasons behind architectural decisions. The
information stayed in the code, in tasks and in discussions, so the implemented
state and the history of decisions could get mixed up with plans.

## Decision

Create an `architect/` directory with two cuts of documentation:

- `architect/README.md` briefly describes only the currently implemented shape of
  the app;
- `architect/decisions/` keeps the immutable history of individual architectural
  decisions in the ADR format.

The documents are versioned together with the code. ClickUp remains the source of
tasks, statuses and bugs; an ADR may refer to ClickUp, but it does not replace
assigning the work.

## Options considered

### A single architecture document

Simpler to start with, but the reasons behind decisions quickly get mixed into
the description of the current state, and the history is lost as the text is
updated.

### An external wiki

Convenient for discussion, but changes to the documentation can drift away from
changes to the code and live in a different review cycle.

### The overview and the ADRs next to the code

Separates the current state from the history of decisions, and the documentation
changes and is reviewed together with the implementation. This option was chosen.

## Consequences

- The project gets one place to get acquainted with the current architecture.
- Significant decisions get explicit context, alternatives and consequences.
- A change to the architecture requires updating the overview and, if needed,
  adding an ADR within the same set of changes.
- Staying current depends on the discipline of the team and on checking the
  documentation during review.

## References

- [Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/)
- [`architect/README.md`](../README.md)
