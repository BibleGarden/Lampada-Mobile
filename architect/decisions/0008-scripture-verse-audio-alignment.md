# ADR-0008: Play a passage using the verse timings inside the chapter audio

- Status: Accepted
- Date: 2026-08-29
- Participants: product owner, developer, QA lead

## Context

Bible API stores the narration as whole chapters, while the result of the
contextual selection contains a range of verses inside a single chapter. Playing
the file in full does not match the chosen passage, and computing the position
from the length of the text is impossible: the reading pace, the pauses and the
background music all differ.

## Decision

When a prayer session starts, freeze the code of the chosen narration together
with the language and the translation. On the first press of "Listen" the client
gets the book alias from `/api/translations/{translation}/books`, then requests
`/api/excerpt_with_alignment` for the exact range. The response gives the MP3 URL
of the whole chapter and the `begin`/`end` of every verse. A single managed
`expo-audio` player seeks to the start of the first verse, checks the position
every 200 ms and stops at the end of the last one.

The internal host from `audio_link` is replaced with the origin of the configured
Bible API, keeping the server path. The public client API key is added to the
query, because the native URL player does not send the `X-API-Key` header while
streaming. During loading and playback the narration takes the existing temporary
audio focus of the session, so the quiet music is paused.

## Options considered

### Fetch a separate MP3 for every passage

Rejected: the API is already optimised for a single Range-compatible chapter file
and exact verse-level timings; slicing would add server storage and latency.

### Estimate the position from the share of the text

Rejected: such a heuristic cuts words in half and catches neighbouring verses.

### Store the timings in SQLite together with the text snapshot

Rejected: the audio is used only in an active online session, and the server
remains the source of current links and alignment. Offline snapshots keep working
as text and show no audio controls.

## Consequences

- Only the range `passage.verse_start..verse_end` of the chosen translation and
  voice is played.
- Pausing continues the same segment; after reaching the end, starting again
  begins from the first verse.
- Switching the passage, switching the panel mode or sending the app to the
  background stops the narration and releases the temporary audio focus.
- An audio error does not affect the text selection, the cache or the favourites.

## References

- Expo Audio SDK 57: https://docs.expo.dev/versions/v57.0.0/sdk/audio/
- Reference: https://github.com/BibleGarden/iOS-App
