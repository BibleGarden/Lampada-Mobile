# ADR-0042: A prayer in the journal counts the day it started

- Status: Accepted
- Date: 2026-10-11
- Participants: product owner, developer
- Partly supersedes: ADR-0033, item 3 (only a completed prayer counted)

## Context

A prayer was interrupted before "Finish": the app was closed and later
reinstalled. The journal showed the prayer, because it lists every session with
saved time, a takeaway, a non-empty answer or a recording. Home had no mark for
that day: `prayed_days` was written only by `complete()`. The journal also showed
the prayer as 0 minutes long, because `elapsed_sec` was written only on
completion.

The journal and the streak used two different rules for one question: did the
person pray that day.

## Decision

1. One rule: a session that appears in the journal counts the local calendar
   day it started. The journal predicate is a single SQL fragment in
   `lib/db.ts`; the journal query, the day synchronisation and the migration all
   use it.
2. A day is in `prayed_days` while the journal has a prayer started on that day,
   with the legacy-day exception in item 6.
   Every write that can change a session's visibility (an answer save, a time
   checkpoint, completion, deletion) brings the day of the session's start in
   line in the same exclusive transaction. The day is `dayKey(new Date(started_at))`
   in the current time zone, as before; the query bounds are the local midnights
   of that day, converted to the UTC ISO format of `started_at`.
3. Deleting the last journal prayer of a day removes the day; a remaining prayer
   of the same day keeps it. Clearing the only answer of a session without saved
   time does the same.
4. The store saves the running prayer's `elapsed` once a minute from the existing
   tick, when the app leaves the `active` state and on the transition to
   reflection. The last saved value is kept outside the store state, so the
   checkpoint causes no re-render. Nothing is saved before the first minute: a
   prayer opened and left at once without answers stays out of the journal and
   the streak. A prayer finished with "Finish" saves its time on completion, as
   before, even when it is shorter than a minute.
5. `elapsed_sec` is written as `MAX(elapsed_sec, ?)`. The store's elapsed time only
   grows, so the order of a checkpoint and the completion write does not matter.
6. A one-time migration (`meta.prayed_days_journal_backfill`) adds the days of the
   journal sessions saved before this rule. It keeps existing days that have no
   journal session until a write removes the last visible prayer of that same
   day (including clearing its only answer); then day synchronisation removes
   the day. They were counted under the previous rule. The legacy
   streak counter (`meta.streak_last_day`, `meta.streak_count`) is now migrated
   once and deleted in the same transaction; it was applied on every launch and
   would have restored a day removed by deleting its last prayer.

## Options considered

### Mark the day when the session row is created

Rejected: a prayer opened and left at once would count, while the journal hides
it. The two rules would diverge again.

### Keep the day after deletion, as before

Rejected: the journal would no longer show any prayer for a day that still
counts, which is the mismatch this decision removes.

### Save the time every second or only on background

Rejected: a per-second write costs a transaction a second while the prayer runs.
A background event alone is not enough: the JavaScript thread may be suspended
before it runs, and a deadline wakeup has no app state change. A minute
checkpoint plus the background write loses at most a minute.

### Compute the local day in SQLite

Rejected: `date(started_at, 'localtime')` depends on the C library's time zone on
each platform. The JavaScript `dayKey` already defines the calendar and the
seven dots on Home.

## Consequences

- An interrupted prayer that lasted at least a minute, or has an answer, keeps
  its duration in the journal and counts its day.
- Deleting a prayer can now break a streak if it was the only prayer of its day.
- The time between the last checkpoint and an unexpected termination, up to a
  minute, is lost.
- A day is dated by the current time zone of the device. A write after a time
  zone change marks the start day in the new zone; a day counted in the old zone
  stays.
- Days counted earlier for sessions deleted under the previous rule stay in the
  streak.

## References

- `lib/db.ts` (`JOURNAL_VISIBLE_SESSION`, `syncPrayedDay`), `lib/store.ts`
  (`saveElapsedCheckpoint`)
- Tests: `lib/__tests__/journalDays.test.mjs`, `lib/__tests__/sessionResume.test.mjs`
- [ADR-0027](0027-resume-current-prayer.md), [ADR-0033](0033-prayer-time-bounds-music-and-day.md)
