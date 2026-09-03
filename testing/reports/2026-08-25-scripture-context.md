# Contextual scripture selection - report of 2026-08-25

## Subject

- ClickUp: `86cb8vw1p`
- Expo SDK 57 / React Native 0.86
- iPhone 17 Pro Simulator, iOS 26.5
- API: the local Bible-API from `.env.local`, `http://192.168.127.133:9084`

## Result

The server-side selection `POST /api/scripture/v1/select` was implemented, along
with a single-flight prefetch of depth one, retry and fallback, a persistent
history and cache, canonical favourites, a lossless migration of the old
favourites, exact references built from `passage`, and the privacy barrier.

## Automated checks

| Check | Result |
| --- | --- |
| `npm run typecheck` | PASS, exit 0 |
| `npm test` | PASS, 49/49, exit 0 |
| `npx expo-doctor` | PASS, 21/21, exit 0 |
| The Release iOS build and install | PASS, exit 0 |
| The Maestro main stub | PASS, exit 0 |
| The Maestro privacy stub | PASS, exit 0; `privacySafe: true` |
| Maestro `503 → 429 → success` | PASS, exit 0 |
| Maestro with the live API plus favourite plus next/back | PASS, exit 0 |
| Maestro legacy favourites | PASS, exit 0 |
| The Maestro layout regression: a wrapped CTA and the maximum reader safe area | PASS, exit 0 |

The full logs and screenshots: `testing/evidence/2026-08-25-scripture-context/`.

## Retest of the manual testing findings

- Bug `86cb9x9uc`: the CTA now depends on the actual number of lines rather than
  on a threshold of 160 characters. A fixture shorter than 160 characters with
  four paragraphs shows "Read in full" and opens the reader.
- Bug `86cb9x9ug`: `BottomSheet` receives the top safe-area inset. On an iPhone
  17 Pro the reader with a long text stays below the system bar after a swipe to
  the maximum snap point.
- Evidence: `reader-short-wrapped.png`, `reader-safe-area-max.png`.

## SQLite verification

- the history contains only the two canonical IDs that were actually shown;
- the third response sits in the cache as a prefetch with `shown = 0`;
- the favourite contains the full snapshot and the canonical ID;
- the migration schema is at version `1`;
- a known legacy record keeps its local text, an unknown one keeps the reference
  and the "Saved earlier" mark; both open without a network.

## Not verified by a human

- a physical iPhone and Android;
- disabling the network at the system level during an open session (the cache
  trail logic is covered by a unit test);
- the product owner's subjective assessment of the new loading/offline state and
  of the favourites screen.
