# Local main consolidation

Date: 2026-09-14

Merged the published `origin/main` at `ea4b718`, interface-language requests,
prefetch validation, settings improvements and the current session-completion
changes into local `main`. Kept both request fields and ADR-0030/ADR-0031.
Preserved the installed SE build version, 1.0.21.

The old `pray-session-finish` worktree contained an uncommitted completion draft
with a three-second delay after narration. Saved it as `0b81953` and merged its
history while retaining the newer one-second completion behavior after all
activities close. The temporary SE build was saved as `8ca9dd7`; its only
remaining change after the other merges was the version increment.

Validation on the combined tree at `a973c94`:

- `npm test`: exit 0; 212 passed, no failures, skips or warnings.
- `npm run typecheck`: exit 0, no diagnostics.
- `git diff --check`: exit 0.
- Full test and typecheck output inspected.
- `git merge-base --is-ancestor` confirmed that every local branch tip,
  `origin/main` and the detached SE build commit are reachable from `main`.
- All extra worktrees were clean after preserving their changes. Their ignored
  contents were dependency symlinks or generated build files; the temporary
  `.env.local` matched the original byte for byte.

Consolidation and branch/worktree cleanup are local. No remote branch was
rewritten, deleted or pushed, and no application build or API request was run.
