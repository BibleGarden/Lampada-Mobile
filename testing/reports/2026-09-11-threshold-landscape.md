# Threshold layout on landscape iPad

Verified on 2026-09-11 using the iPad (A16), iOS 26.5 simulator and the local
development app.

Landscape tablet windows now place the briefing on the left and the
hold-to-start control on the right, within a column up to 1120 pt wide.
Typography and button dimensions are unchanged. Portrait and phone windows
retain the vertical layout. The briefing keeps its independent scrolling.

- With a 15-minute duration and the multi-line goal from the reported example,
  all three briefing items and the full button were visible without scrolling.
- Rotating back to portrait restored the vertical layout and retained the goal.
- `npm run typecheck` passed (exit 0).
- `git diff --check` passed (exit 0).

A temporary preview route set the goal and duration in memory and restored
them after verification. No prayer was started. The route was removed.
Development navigation emitted an `onAnimatedValueUpdate` listener warning;
it did not prevent the visual checks. Physical devices and Split View were not
exercised.

Screenshots were captured with `simctl io screenshot` and oriented for viewing:

- [Landscape](../evidence/2026-09-11-threshold-landscape/ipad-landscape.png)
- [Portrait](../evidence/2026-09-11-threshold-landscape/ipad-portrait.png)
