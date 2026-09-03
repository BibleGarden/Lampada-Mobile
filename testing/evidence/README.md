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

The name of every stored file has to appear in the corresponding report.
Material with no reference from a report counts as orphaned and is deleted
during cleanup.
