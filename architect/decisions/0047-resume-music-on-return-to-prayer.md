# ADR-0047: Resume the music when returning to the prayer

- Status: Accepted
- Date: 2026-11-23
- Participants: product owner, developer

## Context

The prayer ends in two ways that stop its music: the deadline passes while the
app is in the background (ADR-0033 item 1), or the prayer moves to reflection
after the timer or "Finish" (ADR-0033 item 2). Both turn the music off. When
the person then taps "Return to prayer" (ADR-0027), the prayer continues in
silence, and the music has to be switched on again by hand, although it played
a moment ago. The tracks start from a random position of the catalogue on every
mount of the session screen, so a plain `toggleMusic()` would also play another
track.

The session screen owns the players and releases them on unmount, so they
cannot keep the state across the trip to the reflection screen.

## Decision

1. When the prayer's music is stopped by the prayer ending (`stopPrayerMusic`,
   both paths of ADR-0033), the session store records what was playing:
   `musicResume = { trackId, positionSeconds }`, taken from the active player
   before it is paused. The same step turns `musicOn` off. Music that is
   already off changes nothing: a second stop after the deadline stop in the
   background keeps what the first one recorded, unless the timer was extended
   in between (item 5).
2. `resumeSession()` turns `musicOn` back on when `musicResume` is set. The
   session screen reads `musicResume` once at mount and clears it in the store.
   It puts the recorded track first in its track cycle (`startFromTrack`, the
   track is found by `id`, not by index, because the order is random per mount)
   and seeks to the recorded position before the first `play()`. If the seek
   fails, the track plays from the start.
3. The recorded music is dropped when the person presses the music button,
   when the timer is extended, when the prayer is completed (`complete`) and
   when a new prayer starts (`enterSession`, `reset`). A finished prayer never
   starts music.
4. Other audio keeps its priority: the restored music starts through the same
   effect as a tap on the music button, so it waits while a recording, a draft
   or scripture narration holds the audio (ADR-0036).
5. Extending the timer on the session screen does not turn the stopped music
   back on (ADR-0033 item 1), and it drops the recorded music: a prayer that
   continues after the stop ends without music, so a later "Return to prayer"
   keeps the music off.

## Options considered

### Keep the recording in the session screen

Rejected: the screen is unmounted by `router.replace('/reflect')` and its
players are released, so nothing survives until the return.

### Resume by calling `toggleMusic()` on return

Rejected: it ignores whether music played, and the new mount picks a random
starting track and starts from zero.

### Move the players out of the session screen

Rejected for now: a much larger change (ADR-0033 already declined it) for the
sake of a state that two numbers describe.

## Consequences

- The music after the return continues the same track from the position where
  it stopped; the fade-out (3 s or 0.8 s) is not part of the position, as the
  position is read after the fade.
- If a recording or narration is active at the return, the music starts when
  it ends.
- The recorded music lives only in memory, like the session itself (ADR-0027).

## References

- [ADR-0027](0027-resume-current-prayer.md),
  [ADR-0033](0033-prayer-time-bounds-music-and-day.md),
  [ADR-0036](0036-audio-session-leases.md)
