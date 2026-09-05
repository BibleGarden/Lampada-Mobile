# Localized fallback questions and Cyrillic cleanup

## Changes

- Added equivalent English, Russian and Ukrainian fallback pools: five initial,
  eight follow-up and three reflection questions per language.
- Fallback selection and session reset read the active interface language;
  prefetch keys distinguish language changes. Model payloads and language
  inference remain unchanged.
- Moved native language names into a shared catalog and removed the unused
  Russian-only minute formatter. Scripture references require a confirmed book
  name instead of manufacturing a Russian placeholder.
- Translated runtime diagnostics, shell output, test titles and environment
  example documentation into English.
- Preserved Russian code comments, original legacy Scripture used for migration,
  Unicode fixtures and historical evidence/report quotations.
- Regenerated iOS permission resources from English/Russian/Ukrainian locale
  files. The iPhone deployment script now syncs prebuild configuration and derives
  native project paths from the generated Xcode project.

## Static validation

TypeScript, shell syntax and fallback catalog consistency checks passed (exit 0).
The catalogs contain 5/8/3 unique, nonempty questions per language; the English
pool contains no Cyrillic. Source literal inspection found no remaining Cyrillic
outside translation catalogs except legacy Scripture content and mock-server
fixtures. Full command outputs are in `/tmp/lampada-cleanup-typecheck.log`,
`/tmp/lampada-shell-check.log` and `/tmp/lampada-fallback-catalog-check.log`.

Automated test suites were not run, following the owner's local UI workflow.
Existing test assertions and fixtures were not changed; only test titles changed.

## Native installation

Regenerated the native iOS project and installed a fresh local Release on Pray
SE. Build exited 0 with four Xcode warnings (duplicate linker library and signed
widget stripping), plus environment color/cache warnings. The full output is
retained in `/tmp/lampada-fallback-simulator-build.log`. The generated English,
Russian and Ukrainian InfoPlist resources contain the current permission copy.

The installed app launched normally. Settings showed English selected and core
AI processing already denied. Opened Setup and the threshold screen with an empty
topic; the long-press start gesture required the owner's manual interaction.

## Owner acceptance

The owner reviewed the installed result, reported that it looked good, and
requested commit and push. This is owner acceptance; it does not claim an
additional agent-executed end-to-end test.
