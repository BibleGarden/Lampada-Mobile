# Home calendar refresh

Verified on 2026-09-11 with Node's test runner and mocked local time and app-state
events. Home previously reloaded the prayer calendar only on navigation focus,
so a warm return on a later day could still show yesterday as today.

Home now refreshes on activation and schedules the next local midnight while
focused. Backgrounding cancels the timer; leaving Home removes the timer and
listener. Session reset remains tied to navigation focus.

- `node --experimental-strip-types --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test lib/__tests__/homeRefresh.test.mjs lib/__tests__/streak.test.mjs`: 8 passed, exit 0.
- `npm run typecheck`: passed, exit 0.
- `git diff --check`: passed, exit 0.

The tests cover yesterday's prayer moving left after a warm resume, successive
midnights without navigation, a background interval lasting several days,
cleanup on leaving Home, initial background state, 23/25-hour daylight-saving
days, and the existing future-date calendar regression.

Full check logs: `/tmp/pray-home-refresh-tests.log` and
`/tmp/pray-home-refresh-typecheck.log`.
No physical-device midnight transition was exercised. The installed iPad
version 1.0.12 predates this fix.
