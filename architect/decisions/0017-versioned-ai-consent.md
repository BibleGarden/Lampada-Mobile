# ADR-0017: Gate AI content transfers with independent versioned consent

- Status: Accepted
- Date: 2026-09-03
- Participants: product owner, project team

## Context

Prayer topics, written answers, transcripts and audio recordings can reveal
religious beliefs and other sensitive facts. The previous client sent the topic
for question generation without a decision, treated a missing `share_answers`
value as permission, and treated pressing "Transcribe" as sufficient authority
to upload a recording. One boolean could not express the different purposes or
invalidate an old permission after the provider contract changed.

## Decision

The client stores three independent consent records in SQLite `meta`: core
prayer AI, answer context and audio transcription. A record contains
`undecided`, `allowed` or `denied`, the notice version and the provider-contract
identity. A missing, malformed, obsolete or mismatched record resolves to
`undecided`; only a current `allowed` record opens a content-transfer gate.

Core consent gates question generation and whether scripture selection includes
the topic. Answer-context consent independently gates typed answers and finished
transcripts, and can open that field only while the core gate is also open.
Transcription consent is checked again inside the upload client, so interface
code cannot bypass it accidentally. Each first relevant action shows the data,
route, named processor and purpose before an equally weighted allow or deny
choice. Settings expose the same three independent decisions.

The current processor contract identifies company-managed model infrastructure,
not a particular model family. A server-side model swap under the same processing
terms does not require a client release; moving content to a third-party processor
or materially changing those terms requires a new contract identity and renewed
consent.

On migration, legacy `share_answers=0` becomes answer-context `denied`. A missing
or permissive legacy value becomes `undecided`, as do core AI and transcription
for every existing installation. Changing the notice version or provider
contract invalidates the affected stored decisions. A denial keeps local
questions, non-contextual scripture selection, recordings and the journal usable.

## Options considered

### Keep one enabled-by-default switch

Rejected because silence and an old default are not purpose-specific informed
consent.

### Use one consent for all AI features

Rejected because allowing a topic-based question does not authorize sending an
answer or an audio recording.

### Rely only on disclosure dialogs

Rejected because a later refactor or another screen could call a network client
without the dialog. Request builders and the transcription client therefore
enforce the same barriers.

## Consequences

- Fresh and upgraded installations send no prayer content before a current
  purpose-specific decision.
- Denying core AI uses the curated question pools and a scripture request with
  neither `topic` nor `user_replies`.
- Withdrawal changes the in-memory gate immediately and is persisted in SQLite
  before the settings action completes.
- Provider or material contract changes require updating the contract identity
  or notice version and collecting consent again.
- The September 2026 move from Gemini to company-hosted chat and speech models
  changes both identifiers, so an old Gemini allowance resolves to `undecided`.
- Unit tests cover parsing, migration and serialized scripture fields; manual
  scenarios cover all three first-use disclosures and withdrawal.

## References

- [Lampada data processing rules](https://github.com/BibleGarden/Architecture/blob/main/privacy/lampada-data-processing.md)
- [Cross-repository AI processing decision](https://github.com/BibleGarden/Architecture/blob/main/decisions/0001-lampada-ai-data-processing.md)
- [ClickUp: topic and answer consent](https://app.clickup.com/t/86cbcunkb)
- [ClickUp: audio transcription consent](https://app.clickup.com/t/86cbcunm6)
- [ClickUp: company-hosted AI migration](https://app.clickup.com/t/86cbegfzt)
