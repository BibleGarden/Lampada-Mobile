# Interface language: English, Russian and Ukrainian

## Scope

The interface language is a separate persisted setting. It covers screens,
accessibility labels, errors, privacy disclosures, reminder copy and system timer
labels. AI request language behavior and Scripture preferences remain independent.
Existing topics, answers, transcripts and saved passages are not rewritten.

## Manual acceptance scenarios

1. Open Settings and select English, Russian and Ukrainian in turn. Confirm the
   selected indicator, section labels and error/empty-state copy change without
   restarting or changing Scripture preferences.
2. Leave Ukrainian selected, fully close and reopen the app, and confirm the
   selection persists without a flash of another interface language.
3. Open Home, Setup, the journal, favorites, About and privacy/PIN dialogs in each
   language. Confirm text fits and accessibility labels use that language.
4. Select a translated example intention. Confirm the field receives exactly the
   displayed text. Switch the interface language and confirm an existing topic
   remains unchanged.
5. With reminders already enabled, switch the language. Confirm the number and
   timing of scheduled notifications stay the same and newly delivered reminders
   use the selected language. Repeat rapid switches and confirm no duplicates.
6. In a fresh native build, start a timed prayer and inspect the iOS Live Activity
   or Android notification in each language. Confirm timer behavior is unchanged.
7. Inspect device-owned permission prompts using the OS app language setting.
   These prompts follow native locale files rather than the in-app selector.

## Execution limits

Automated tests were not run, following the repository owner's local UI workflow.
The existing Pray SE simulator was opened but the app was protected by a PIN;
manual switching and persistence checks require the owner to unlock it. Native
permission localization and Android timer changes require a fresh native build.

## Completed static checks

- `npm run typecheck`: passed, exit code 0.
- Catalog validation: matching keys and interpolation parameters across all three
  languages; all literal translation references resolved, exit code 0.
- `npx expo export --platform ios --output-dir /tmp/pray-i18n-export`: passed,
  exit code 0, 4,224 bundled modules. The environment emitted repeated
  `NO_COLOR`/`FORCE_COLOR` precedence warnings; no bundle errors occurred.
- Full check outputs were retained and read from `/tmp/pray-i18n-typecheck.log`,
  `/tmp/pray-i18n-catalog-check.log` and `/tmp/pray-i18n-export.log`.

This is a JavaScript export, not a native build or a completed device acceptance
run. The simulator still showed the PIN gate at the final observation.

## Simulator installation follow-up

The owner reported that the language selector was absent. The open simulator
was still running the prior installation. Installed a fresh local Release build
on Pray SE using `npm run ios -- --device 18FBF907-60BB-48EF-9BE8-1DB2767465F5
--configuration Release --no-bundler` after the local environment preflight.

The first native launch exposed unavailable `Intl.PluralRules` in the iOS runtime
and a Home render crash. Replaced it with explicit cardinal rules for en/ru/uk in
`lib/uiLanguage.ts`, reran TypeScript (exit 0), then rebuilt and reinstalled.
The final native build exited 0 with two Xcode warnings about signed widget
binaries, plus environment color warnings. Full final output was read from
`/tmp/pray-i18n-simulator-rebuild.log`.

The installed app then displayed the translated English PIN gate normally.
Requested the owner to unlock it for checking the selector.

After the owner unlocked the simulator, opened Settings and confirmed the
interface-language selector at the top. Manually selected Ukrainian and Russian;
section headings, reminder summaries and accessibility labels changed immediately.
The Bible language (English), translation (BSB) and voice (Bob Souer) remained
unchanged. Left Settings open with Russian selected. Visual screenshot inspection
confirmed the three language rows and selected indicator are visible.

## Accepted compact picker

Changed the selector to one row showing the current language and a trailing
chevron. Tapping expands the three-language list; a successful selection closes
it. Rebuilt and installed the local Release on Pray SE, opened Settings, expanded
the list and selected Russian. Confirmed the list collapsed and the selected
language remained visible. The owner accepted the appearance and requested
commit and push. No automated tests were run for this layout change.
