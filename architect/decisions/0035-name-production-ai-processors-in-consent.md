# ADR-0035: Name the production AI processors in consent

- Status: Accepted
- Date: 2026-09-28
- Participants: product owner, developer

## Context

The production processing route changed on 2026-09-27. The mobile notice still
described all AI processing as company hosted, and its stored contract identity
matched that obsolete description. The public Privacy Policy now distinguishes
Google Gemini from the models run on operator-managed servers.

## Decision

The core prayer AI and answer-context notices name Google Gemini through
Google's paid API for guiding questions and contextual Scripture selection.
The audio-transcription notice names both permitted processors: Whisper on
operator-managed servers or Google Gemini through Google's paid API. Whisper is
the current production route. Scripture search uses bge-m3 on operator-managed
servers. Bible API remains the app's route to each processor, and does not store
the recording.

The notice version changes from 2 to 3 and the provider-contract identity from
`company-hosted-ai-2026-09` to
`google-gemini-paid-whisper-self-hosted-2026-09`. The existing three records
share these two identifiers. Per ADR-0017, every prior decision, including an
allowance for transcription, becomes `undecided` on the next settings load.
No old allowance is silently carried into the new notice.

This notice authorizes either named transcription processor. Switching from
Whisper to Google Gemini under the same paid-API processing terms changes
neither the disclosed provider contract nor its identity, so it does not require
renewed consent. This is the narrow exception to ADR-0017's earlier rule that
moving content to a third-party processor always changes the contract. Adding
another processor or materially changing the Google terms still requires a new
notice, contract identity and consent. The published Privacy Policy currently
says that recordings do not reach Google; it must be updated before that route
is used.

## Options considered

### Preserve the old consent records

Rejected because they describe a materially different processor and do not
record permission for Google Gemini under the current wording.

### Add per-purpose notice versions now

This could preserve a transcription decision, but would change the established
record format and migration rules. The current shared version already defines
the conservative behavior for a notice change.

## Consequences

- A person who previously allowed any of the three purposes must decide again
  before that content is transferred.
- Denial and undecided behavior remain the local paths defined in ADR-0017.
- The mobile disclosures and test expectations name both possible transcription
  processors. The public Privacy Policy must reflect the route before it changes.

## References

- [Versioned consent](0017-versioned-ai-consent.md)
- [Published Privacy Policy](https://lampada.app/privacy), checked 2026-09-28
