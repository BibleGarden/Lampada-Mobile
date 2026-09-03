# ADR-0015: The answer sheet - a pinned question and buttons, one scroll between them

- Status: Superseded by ADR-0016
- Date: 2026-08-31
- Participants: QA lead, product owner

## Context

The answer sheet (`components/AnswerSheet.tsx`) holds four kinds of content: the
question, the text field, the list of voice recordings and the button bar. There
can be several recordings, each may grow a transcript block, and above the
keyboard only half the height is left.

The body of the sheet did not scroll: its height equalled the visible part of the
sheet, and inside it three zones competed for room with fixed flex rules. The
answer field was `flexGrow: 1, flexShrink: 0, flexBasis: 96` - it took all the
free space and never gave it back. The list of recordings was `flexShrink: 1` -
the only one that yielded. The result on an iPhone SE:

- three lines of an answer occupied a box of about 450 pt, while the list of
  recordings shrank to a stub and a card was cut through the middle;
- the list's own `BottomSheetScrollView` did not help: `@gorhom/bottom-sheet`
  unlocks the inner scroll only at the upper snap point, so at the lower one
  (62%) a short swipe was intercepted by the sheet gesture and the list did not
  scroll at all - the content below the edge was unreachable;
- an arriving transcript grew the card and pushed it past the edge together with
  the other recordings - it was impossible to see the result of one's own
  action.

## Decision

One scrollable zone for all the variable content.

- Only the header (the kicker and the question) and the button bar are pinned:
  the question is the context of the answer and must not scroll away, the buttons
  are the way out of the sheet.
- Between them a single `BottomSheetScrollView`: the answer field, the recording
  error and the list of cards. Nothing is clipped, everything is reachable with
  an ordinary swipe.
- `enableContentPanningGesture={false}` - the library unlocks the inner scroll at
  any snap point. The sheet itself is dragged by the handle.
- The answer field grows with the text (`AutoGrowInput`, `minHeight` instead of
  `height`, inner scrolling disabled). While the content fits, `flexGrow`
  stretches the field to the bottom - an empty sheet looks as it did before.
- The transcript arrives as a block labelled "TRANSCRIPT" with its own actions
  (retry, remove); its appearance opens the sheet to the upper point, because it
  is a direct answer to a person's press.
- A hint at the bottom edge of the list when the content is longer than the
  visible part. The geometry is computed on the UI thread from the animated
  position of the sheet: `onLayout` of the children does not fire after the sheet
  changes and would lie.
- The body of the sheet is wrapped in `column()` per ADR-0012. The sheet was the
  only screen without a column: on a tablet in landscape the answer line ran to
  about 70 characters and "Save" stretched across all 1210 pt. On a phone the
  `sc(360)` cap is unreachable and the layout does not change.

## Options considered

### Adjust the flex proportions locally

Change the `flexShrink` of the field and the minimum height of the list.
Rejected: there are many combinations of states (empty / text / one recording /
several / transcript / keyboard), and every new one breaks the proportions again.
It also does not solve the main problem - the content being unreachable at the
lower snap point.

### A single 100% snap point

Always full height: the inner scroll works with no extra settings. Rejected: the
prayer timer visible behind the sheet is lost.

### Open the sheet automatically once the content stops fitting

Implemented and rejected: it requires comparing the content height with the
height of the visible area at the lower point, and `onLayout` of the children
does not fire after the animated change of the body height - the measurement lied
systematically. After `enableContentPanningGesture={false}` the need disappeared:
the list scrolls at 62% too.

## Consequences

- No state is clipped, and the content is reachable with an ordinary scroll.
- An empty sheet is compact in meaning but visually unchanged: the field
  stretches to the bottom while there is room.
- A downward swipe over the content no longer moves the sheet - only the handle
  does, and (for an empty sheet) a tap on the dimmed area. This only makes test
  ANS-003 stricter: a swipe over a draft can no longer discard it at all.
- `GoldButton` shrinks the label size instead of wrapping - "Save and finish" no
  longer bursts the button.
- On a tablet the column is centred and the measure of the line is constant in
  both orientations.

## References

- Code: `components/AnswerSheet.tsx`, `components/ui.tsx`
- Library: `@gorhom/bottom-sheet`, `hooks/useScrollable.ts` - the rule
  `if (!enableContentPanningGesture) return SCROLLABLE_STATUS.UNLOCKED`
- Related decisions: [ADR-0002](0002-server-audio-transcription.md),
  [ADR-0012](0012-single-layout-fitted-to-window.md)
