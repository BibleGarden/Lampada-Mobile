# AI data processing copy

Date: 2026-09-13.

The pre-prayer briefing, privacy settings and the first-use disclosures now use
one explicit rule: prayer topics, answers, completed transcripts and selected
audio are sent to the application server only for AI processing and are not
stored there. The copy is aligned in English, Russian and Ukrainian.

The unrelated PIN recovery explanation remains unchanged: its server reference
describes the absence of a PIN backup, not AI data processing.

## Checks

| Check | Result |
|---|---|
| Full Node test suite with the dot reporter | exit 0, 200 tests |
| `npm run typecheck` | exit 0 |
| Locale audit of server/send wording | every AI data transfer states both the AI-only purpose and no server storage |
| `npm run ios -- --device <Pray SE identifier> --no-bundler` | exit 0, Lampada 1.0.20 installed and launched on Pray SE |

The installed app opened the Home screen from the running project Metro server.
The build reported no errors and one existing duplicate `-lc++` linker warning.
