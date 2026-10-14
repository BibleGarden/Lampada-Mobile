# Zero-length verse alignment validation — 2026-10-14

The final code revision was checked with `npm run typecheck` (exit 0) and
`npm test` (exit 0: 543 Node tests and 27 Python tests). Full command output:
[`typecheck.log`](../evidence/2026-10-14-zero-length-verse/typecheck.log) and
[`unit.log`](../evidence/2026-10-14-zero-length-verse/unit.log).

Using the local API configuration without recording the key, the production
`fetchScriptureAudioClip` client accepted Proverbs 18:1-25 (translation 1,
voice 1): 25 aligned verses, verse 8 at 56.73-56.73, verse 9 starting at
56.73, and clip end at 191.75 seconds. No app build or Maestro run was made
under the task's device restriction. The affected Maestro mock does not serve
`/api/excerpt_with_alignment`, so a zero-length alignment cannot be added to
its existing fixtures without implementing a new audio mock.
