# ADR-0006: Structured verses for scripture highlighting

- Status: Accepted
- Date: 2026-08-28
- Participants: product owner, developer, QA lead

## Context

Bible-API picks one to three key verses inside a passage and returns their
coordinates in `highlight.passage`. `passage.text` alone is not enough for exact
highlighting: the server joins neighbouring verses of the same paragraph with
spaces, so the client cannot reconstruct the boundaries from sentences or line
breaks.

## Decision

Use the additive `passage.verses` array with the verse number, the exact text and
a paragraph-start flag. The client assembles the visible text from the array only
if the result matches `passage.text` byte for byte, and applies the highlight by
the `highlight.passage` range. The canonical coordinates are not used for
rendering. If `verses` is missing or does not match the text, the app shows the
previous `passage.text` without heuristic highlighting.

## Options considered

### Character ranges

Rejected: Python and JavaScript count Unicode differently, and text
normalisation makes such offsets fragile.

### An extra request for the full passage

Rejected: it adds latency and a new point of failure after the contextual
selection has already completed.

### Heuristic splitting of the text

Rejected: sentence and paragraph boundaries do not coincide with verse
boundaries.

## Consequences

- The highlighting works in the numbering of the chosen translation, the Psalms
  included.
- Old responses and cache entries without `verses` keep being displayed as
  before.
- The snapshot of the response in SQLite stores the verse-level data
  automatically, with no new schema migration.
- Until the server contract is published, the feature is verified against a
  contract stub.
