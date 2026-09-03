# The language, translation and narration settings - 2026-08-27

## Scope

- three dependent lists on the settings screen;
- the `/api/languages` and `/api/translations` catalogues;
- the atomic saving of the language, the translation and the narration;
- applying the language and the translation from the next prayer session;
- restoration after a restart and the filtering of the offline fallback.

## Automated checks

| Check | Result |
| --- | --- |
| `npm run typecheck` | exit 0 |
| `npm test` | exit 0, 57/57 |
| `node --check scripts/scripture-stub.mjs` | exit 0 |
| An iOS Debug build, iPhone 17 Pro / iOS 26.5 | exit 0, 0 errors, 1 Xcode warning about a duplicate `-lc++` |
| `ios-scripture-settings.yaml` | exit 0 |
| `npx expo-doctor` | exit 1: 10 SDK 57 dependencies are one patch behind |

## Manual retest

1. `English → bsb → Bob Souer` were chosen.
2. "Save" was pressed.
3. The app was force-stopped and launched again.
4. All three values were restored on the settings screen.
5. In SQLite `meta.scripture_preferences` holds `language=en`,
   `translationCode=16`, `voiceCode=151`.

## Evidence

- `testing/evidence/2026-08-27-scripture-settings/settings-persisted.png`
- `testing/evidence/2026-08-27-scripture-settings/typecheck.log`
- `testing/evidence/2026-08-27-scripture-settings/tests.log`
- `testing/evidence/2026-08-27-scripture-settings/maestro.log`
- `testing/evidence/2026-08-27-scripture-settings/expo-doctor.log`

## Limitations

- Playing the chosen narration is not part of this task.
- The drift of the Expo patch versions existed before this change and needs a
  separate dependency update.

## Follow-up after the visual feedback

- The default of a fresh installation was changed: the primary device language if
  the server supports it, English otherwise.
- An existing saved choice takes unconditional priority.
- The collapsed rows of the three lists and the option rows were moderately
  reduced in height and inner padding; the structure and the text sizes stayed
  readable.

### Repeated checks

| Check | Result |
| --- | --- |
| `npm run typecheck` | exit 0 |
| `npm test` | exit 0, 60/60 |
| An iOS Debug rebuild with `expo-localization` | exit 0, 0 errors |
| A clean installation with the primary locale `en-KZ` | `en / 16 / 151` was chosen automatically |
| Choose Russian explicitly with the locale `en-KZ`, then restart | `ru / 1 / 1` was preserved, the locale did not override the choice |

Additional evidence:

- `testing/evidence/2026-08-27-scripture-settings/settings-compact-default.png`
- `testing/evidence/2026-08-27-scripture-settings/maestro-default-language.log`
- `testing/evidence/2026-08-27-scripture-settings/maestro-user-choice-overrides-locale.log`
- `testing/evidence/2026-08-27-scripture-settings/typecheck-followup.log`
- `testing/evidence/2026-08-27-scripture-settings/tests-followup.log`

## Follow-up on the translation labels

- The technical API alias is no longer shown to the user as a name.
- The large line comes from `translation.name` (`BSB`, `WEBUS`, `WEBBE`).
- The secondary line comes from `translation.description` (`Berean Standard
  Bible`, `World English Bible - US Edition`, `World English Bible - British
  Edition`).
- The collapsed value uses `translation.name` as well; `alias` stays a technical
  field and is not shown in this UI.
- A repeated `npm test`: 60/60, the typecheck and the Maestro check of all six
  labels - exit 0.

Evidence:

- `testing/evidence/2026-08-27-scripture-settings/translation-labels-corrected.png`

## Follow-up on the option dividers

- A `StyleSheet.hairlineWidth` pale semi-transparent line was added between
  neighbouring options; there is no divider after the last one.
- The typecheck, 60/60 unit tests and the Maestro UI check - exit 0.
- Evidence: `testing/evidence/2026-08-27-scripture-settings/option-dividers.png`.
