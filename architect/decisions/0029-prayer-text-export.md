# ADR 0029: Export a prayer as plain text through the system share sheet

Status: Accepted

## Context

The journal keeps a prayer as rows in the local database: the session, the
answers, the recordings with their transcripts and the saved passages. Users want
to pass a single prayer on - to a spiritual director, to a group chat, to their
own notes. Until now nothing could leave the device except the AI requests
covered by ADR-0017.

## Decision

Export one prayer as plain, human-readable text, localized in the interface
language. `lib/exportPrayer.ts` builds the note as a pure function of the journal
entry, its `getJournalDetail` content, its saved passages, the translator and the
locale tag: the topic (or a neutral "Prayer"), the start and the duration, the
questions with their answers and the transcripts of the related recordings, the
saved passages, the takeaway and the app name.

The text is read where no markup is rendered - notes apps and messengers - so the
structure is carried by explicit localized labels rather than by typography: every
line is prefixed with `Topic:`, `Date:`, `Duration:`, `Question N:`, `Answer:`,
`Voice note:`, `Saved passages:` or `Takeaway:`, and a line of three em dashes
separates the meta block, the questions, the closing block and the app name. A
label is printed only when it has content, and an empty section takes its
separator with it. Questions are numbered from one by display order, so a gap in
the stored `questionIndex` never shows up as a gap in the reader's numbering, and
recordings without a matching answer continue the same numbering.

Deliver it with the built-in `Share.share` of React Native from the expanded
journal card. No new native dependency, no file is written, no request is made:
the destination is chosen by the user inside the system sheet, and a dismissal is
not an error.

Audio never leaves the device. Only transcripts the user already sees in the
journal are exported, and recordings without a transcript are skipped rather than
announced. File URIs are not part of the text.

Structured formats - JSON, PDF, a whole-journal archive - are out of scope. The
export exists to be read by a person, not to be imported back.

## Validation

`lib/__tests__/exportPrayer.test.mjs` covers the labels and separators in order,
the question numbering, the block order, the question order,
transcripts with and without text, the fallbacks for an empty topic, missing
detail and a broken start date, the three interface languages, and the absence of
file URIs. The `JRN-014` scenario checks the share sheet on a device.
