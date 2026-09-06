# Threshold circle localization layout verification

## Scope and fix

The hold-to-start circle uses three hint states: idle, holding, and question loading.
Cancellation returns to idle. The start label remains visible in each state.
Previously the uppercase hint had no width constraint and used wide tracking.
The hint now has a centered 112-unit width, a fixed 32-unit two-line area,
13-unit line height, and reduced tracking. The icon and start label keep stable
positions. Text scaling inside the fixed circle is capped at 1.2.
The briefing scrolls independently so larger text cannot overlap the circle.

## Visual verification

Device: Pray SE simulator, iOS 26.5, 375 × 667 points.
System text sizes: Large (default) and Extra Extra Extra Large.

| Language | Idle | Holding | Loading | Start label |
| --- | --- | --- | --- | --- |
| English | press and hold | keep holding… | preparing a question… | BEGIN |
| Russian | нажми и держи | держи… | готовлю вопрос… | НАЧАТЬ |
| Ukrainian | натисни й утримуй | утримуй… | готую запитання… | ПОЧАТИ |

All 18 combinations were captured and visually inspected. Every hint is complete,
fits within two lines, and stays inside the circle without colliding with the icon
or start label. The briefing no longer overlaps the circle at XXXL.

Temporary local query parameters selected the language and hint on the actual
threshold screen to capture transient states without making AI requests. Those
parameters were removed after verification. These captures verify text layout,
not gesture timing, progress animation, or live server responses. Default system
text size was restored. No iPad or Android visual run was performed.

## Checks and evidence

- `npm run typecheck`: exit 0, no errors or warnings; full output reviewed.
- `git diff --check`: exit 0.
- [Default-size contact sheet](../evidence/2026-09-06-threshold-circle/all-states.png)
- [XXXL contact sheet](../evidence/2026-09-06-threshold-circle/all-states-xxxl.png)
- Individual full-screen captures are in the same evidence directory.
