# Backup question label

Date: 2026-09-13.

## Result

The session card now reads the stored source of the current question. Questions
from the bundled local pool have a subtle `BACKUP QUESTION` caption below their
text; server questions remain unlabelled. The caption is localized in English,
Russian and Ukrainian and matches the existing reflection-screen terminology.

## Checks

| Check | Result |
|---|---|
| Full Node test suite with the dot reporter | exit 0, 200 tests |
| `npm run typecheck` | exit 0 |
| Local Release environment preflight | exit 0 |
| `npm run iphone` with the connected iPad selected | exit 0, `BUILD SUCCEEDED` |
| Installed application version and process | Lampada 1.0.19 installed and running |
| Release bundle inspection | backup-question label identifier present |

The production API returned normal questions during verification, so the backup
state was not forced on the owner's iPad settings after installation.
