# Reminder editor header and footer

Verified on 2026-09-12 in the Pray SE simulator, iOS 26.5, using the actual
settings screen in a local Debug build connected to Metro.

This follows the earlier [appearance check](2026-09-12-reminder-editor.md).

- The reminder editor has no close cross or kicker above its title.
- The schedule deletion button is a compact square to the left of Done.
  Both buttons share the footer height; Done fills the remaining width.
- Two reminder times and the footer fit on the narrow screen.
- The existing deletion callback is retained; saved schedules were not deleted.
- `npm run typecheck` and `git diff --check` passed with exit code 0.

[Final footer screenshot](../evidence/2026-09-12-reminder-editor/iphone-se-footer.png)
