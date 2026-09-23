# Testing evidence

`evidence/` holds only selected material tied to a dated report in `reports/`.

What is kept:

- final screenshots of the states under test;
- the decisive logs of a reproducible run;
- snapshots of the data before and after important transitions;
- a summary of commands and exit codes.

Full Xcode and system logs, repeated attempts, duplicate crash reports and build
artifacts stay in `/tmp`, in CI artifacts or in other external storage. They are
not added to the repository without a separate reason.

The name of every stored file has to appear in the corresponding report - by name,
or through a directory, a range or a glob reference. Material with no reference
from a report counts as orphaned and is deleted during cleanup.

New dated folders are produced with `maestro test --test-output-dir
testing/evidence/<date>-<topic> ...` (see `../README.md#running`), which places
screenshots in a `screenshots/` subfolder (e.g.
`2026-09-23-topic/screenshots/NAME.png`). Older folders captured before this
convention keep screenshots directly at their top level - leave them as-is.
