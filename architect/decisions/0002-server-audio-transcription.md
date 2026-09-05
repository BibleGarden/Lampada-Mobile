# ADR-0002: Transcribe voice answers through the server-side Gemini proxy

- Status: Partly superseded by ADR-0017
- Date: 2026-08-23
- Participants: product owner, project team

## Context

Voice answers were stored only as local audio files. They could not be read
without listening to them, shown as text in the journal, or found through search.
Expo SDK 57 provides no speech-to-text API, and a separate native iOS module
would have added complexity to the first version without giving future
localisations the same behaviour.

## Decision

The client saves the finished M4A file locally and shows a "Transcribe" action
next to it. Only after an explicit press is the file sent to a protected
`Bible-API` endpoint. The server passes the audio to `gemini-3.5-flash-lite`,
asks for a verbatim transcript in the original language and returns the text
only. The device locale is used as a soft hint, not as a restriction or a command
to translate.

Without the press the audio never leaves the device and no Gemini tokens are
spent. ADR-0017 additionally requires a separate current transcription consent:
the press requests the feature but is not itself informed consent. Neither the
audio nor the transcript is stored on the app server or written into its logs.
The local audio file is saved regardless of whether the request succeeds. The
received text is stored in SQLite, shown in the journal and included in the
local search.

## Options considered

### The local Apple Speech framework

Better for privacy, but it requires a custom native Expo module, a separate
permission and a check of the on-device model availability for every language.

### A dedicated paid speech-to-text API

Solves the task predictably, but adds a new provider and a bill. The project
already has a server-side Gemini proxy and a suitable multimodal model.

### The server-side Gemini proxy

Gives a minimal implementation on the existing infrastructure and supports
different languages without being tied to the interface locale. This option was
chosen.

## Consequences

- Transcription needs an explicit action and a network; on an error the audio
  stays available and the request can be repeated.
- A voice recording crosses an external data boundary, so the interface and the
  system permission state the sending explicitly.
- The free Gemini tier may have its own data processing terms; the way the app is
  operated and its privacy policy have to match them.
- A real M4A upload has to be verified on a physical iPhone after the API is
  deployed.

## References

- [Expo Audio SDK 57](https://docs.expo.dev/versions/v57.0.0/sdk/audio/)
- [Gemini Audio understanding](https://ai.google.dev/gemini-api/docs/audio)
