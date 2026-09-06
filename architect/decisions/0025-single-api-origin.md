# ADR 0025: Configure one API origin

Status: Accepted

## Context

The app uses one Bible API service but previously exposed three endpoint URL
variables and inferred other endpoints from the question or Scripture URL.
This allowed one environment to route related methods to different servers.
The owner requested a single configured server address and paths in code.

## Decision

Use `EXPO_PUBLIC_API_URL` for the HTTP(S) origin only and keep the existing
limited `EXPO_PUBLIC_AI_PROXY_KEY`. Centralize endpoint paths and URL resolution
in `lib/apiConfig.ts`. All API clients use it, including catalogs, aligned audio,
contacts and version checks. Debug About shows the normalized server origin.

Reject origins containing credentials, endpoint paths, query strings or
fragments. Support HTTP and explicit ports for local development. Preserve
request bodies, authentication, consent gates, timeouts and retry behavior.
Keep test transport overrides separate from runtime environment configuration.

## Consequences

There is no fallback to legacy per-endpoint URL variables. Existing local and
EAS environments must replace them with the new origin before building.
Preflight validates the origin and both required values without printing them.
Metro must restart after local environment changes; Release and EAS binaries
must be rebuilt and reinstalled. This replaces the earlier endpoint-resolution
configuration described in ADR-0002 and ADR-0003 without changing their APIs.
