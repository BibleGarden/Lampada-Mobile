# ADR-0022: Localize bundled fallback questions

## Status

Accepted

## Context

ADR-0021 separates interface language from model-generated question language.
The owner subsequently requested that bundled fallback questions also support
English, Russian and Ukrainian. These questions are used when AI is unavailable
or the user has not allowed AI processing.

## Decision

Keep first-question, follow-up and reflection pools in
`lib/locales/fallbackQuestions.ts`, with equivalent entries in all three languages.
Resolve the active interface language when selecting a fallback. Session resets
read the current pool instead of reusing an array initialized at module load.
Question and reflection prefetch keys include the interface language so a ready
fallback from a previous language is not reused after switching.

Model requests retain their existing contract: the model infers language from
the topic and replies. No interface-language instruction or field is added to
the request. Already displayed or saved questions are never rewritten.

## Alternatives

- Keep Russian-only fallbacks: rejected by the owner.
- Detect topic language locally: adds a separate, unreliable language inference
  mechanism for short or empty topics.
- Send fallback translation requests: defeats availability without AI or consent.

## Consequences

Offline and consent-denied sessions have localized fallback content. The three
catalogs must keep equivalent pool entries. Legacy Scripture migration snapshots,
Unicode test inputs and historical evidence remain in their original language.
