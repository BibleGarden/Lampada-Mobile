# Highlighting the key verses - report of 2026-08-28

## Subject

- ClickUp: `86cbb120a`
- Expo SDK 57.0.17 / React Native 0.86.3
- iPhone 17 Pro Simulator, iOS 26.5
- API: the local `scripts/scripture-stub.mjs`

## Result

The client accepts the optional `passage.verses` and `highlight`, assembles the
paragraphs from the structured verses and highlights the range strictly by
`highlight.passage`. Responses and old cache entries without `verses` are
displayed as the previous solid text; `coverage_empty` counts as a successful
server-side degradation.

## Automated checks

| Check | Result |
| --- | --- |
| `npm test` | PASS, 64/64, exit 0 |
| `npm run typecheck` | PASS, exit 0 |
| `git diff --check` | PASS, exit 0 |
| The Release iOS build and install | PASS, exit 0 |
| Maestro `ios-scripture-highlight.yaml` | PASS, exit 0 |

## Retest of the defect that was found

Bug `86cbb2nwd`: the highlight background captured the paragraph break and
produced a large rectangle. The inter-verse prefix was moved out of the styled
`Text`; a repeated Maestro run and a visual check of the preview and the reader
confirm that the background is limited to the text of the key verse.

## Evidence

- `testing/evidence/2026-08-28-scripture-highlight/preview-highlight.png`
- `testing/evidence/2026-08-28-scripture-highlight/reader-highlight.png`

## Limits of the check

The live retest against the new Bible-API was not performed: the commit `dc9a6b4`
named in ClickUp is absent from the available local repository and from
`origin/master`. The contract was verified against the final ClickUp comment and
the local stub.
