# ADR 0028: Show prayer completion on Home

Status: Accepted

## Context

The separate completion screen repeated the Home background, flame, title and
prayer-day information. It required an extra tap to reach almost the same screen.

## Decision

After successful `complete`, dismiss the keyboard and navigate directly Home using
`router.dismissTo`. If Home is absent, the router replaces the current route.
Home consumes the `prayerSaved` parameter and shows a localized "Prayer saved"
message for four seconds. Existing focus handling resets runtime state and loads
the persisted prayer-day information. The journal retains the saved takeaway.

The previous `/done` route becomes a compatibility redirect. It never displays a
save confirmation by itself. The return-to-prayer action on reflection is unchanged.

## Validation

Check completion with and without a takeaway, the brief confirmation and its
expiry, journal persistence, and older `/done` links. Update existing end-to-end
flows to expect Home directly instead of tapping a second Home button.
