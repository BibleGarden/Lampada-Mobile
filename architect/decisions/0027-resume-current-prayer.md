# ADR 0027: Resume the current prayer from reflection

Status: Accepted

## Context

The reflection screen offers a return to prayer. Calling `enterSession` created
a new database session and cleared the current answers and scripture trail.
Users expect to continue their existing prayer when selecting this action.

## Decision

Use a separate `resumeSession` action. It preserves the session ID, question and
scripture histories, answer text and recording references, navigation positions,
and scripture preferences. It does not create a session or reload initial content.

Retain the previous fresh-countdown behavior: a finite session receives another
interval of its selected duration, including any adjustments. Untimed sessions
remain untimed. Keep the original session start and cumulative wall-clock elapsed
time, including time spent reflecting. Restart the system timer for the new interval.
Invalidate pending reflection results before returning to the session screen.

Final completion updates the original database session. A session already unloaded
by the OS is outside this change; this action continues the in-memory session.

## Validation

Store-level regression tests exercise expired, early-finished and untimed prayers,
retention of answer recordings and scripture positions, cumulative final journal
completion, stale reflection results, and absence of an active session.
