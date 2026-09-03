# ADR-0007: Judge Bible API availability by the HTTP request

- Status: Accepted
- Date: 2026-08-29
- Participants: product owner, developer, QA lead

## Context

Before selecting scripture the app called `expo-network` and treated
`isConnected: false` or `isInternetReachable: false` as sufficient grounds not to
send the HTTP request. In the simulator an active connection could be reported as
`UNKNOWN`, for which Expo SDK 57 returns `isConnected: false`. As a result a
working Bible API was never called, and the user saw a saved passage with a false
"Offline" caption. The question requests worked meanwhile, because they did not
use that preflight.

## Decision

1. Always attempt the Bible API request if it is configured and the session was
   not cancelled.
2. Treat the transport result as the source of truth: the HTTP response, a
   network error or a timeout from `scriptureClient`.
3. Keep the existing retries, `AbortSignal`, single-flight and the fallback to
   previously shown snapshots after an actual request failure.
4. Remove the now unused `expo-network` dependency.

## Options considered

### Keep the preflight and ignore `isInternetReachable` only

Rejected: `isConnected` is also false for a connection type of `UNKNOWN`, and the
presence of a network interface does not prove that a particular API is reachable
anyway.

### Use the preflight only to speed up a genuine offline case

Rejected: speeding up the fallback does not make up for falsely refusing a
working request. A transport error usually comes back immediately; the worst case
is bounded by the timeout and the retry policy of the client.

## Consequences

- A working Bible API is called even when the system network hint is inaccurate.
- In a genuine offline case the fallback may appear later, if the OS does not
  fail the request with an immediate network error.
- An extra native module for network detection is no longer needed.
- The "Offline - from the saved ones" caption still means a transport or server
  fallback; spelling out the reasons in the interface remains a separate task.

## References

- [ADR-0003](0003-contextual-scripture-selection.md)
- Expo Network SDK 57: https://docs.expo.dev/versions/v57.0.0/sdk/network/
