# ADR 0020: Application-specific update checks

Status: Accepted

## Context

Lampada and Bible Garden share an API but have independent releases. Lampada
needs the same optional and mandatory update flow as Bible Garden, without
applying Bible Garden's minimum supported version to Lampada.

## Decision

On root mount, request `GET /api/version-check?app=lampada&app_version=...`
using the existing API origin and key. Read the installed marketing version via
`expo-application.nativeApplicationVersion`; do not use an OTA/config version.
Accept only responses identifying `app=lampada`. Ignore unavailable, malformed,
unidentified or wrong-application responses, with a ten-second request deadline.

`none` keeps the app usable. `soft` offers Update and Later; dismissals last for
this process only. `hard` has no dismiss action and intercepts Android Back.
The update overlay survives route changes and hides navigation from screen
readers. PIN/biometric locking and the background privacy curtain take precedence.
Opening the HTTPS store URL does not dismiss a mandatory update; link failures
show a retryable inline message. There is no periodic or foreground recheck.

The server maintains separate thresholds and an enable switch for Lampada.
Its future App Store URL is `https://apps.apple.com/app/id6806024678`. Checks
remain disabled until the listing is public. The API must be deployed before
activation; old API responses cannot block this client.

## Consequences

This is a store-update notice, not an OTA updater. A native rebuild is required
for the explicit `expo-application` dependency. Publish the listing before
switching on updates, and increase the minimum supported version only when
older builds must stop being used. A network failure does not enforce a remote
minimum; this matches Bible Garden's availability policy.
