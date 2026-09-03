# ADR-0005: The scripture language default from the device

- Status: Accepted
- Date: 2026-08-27
- Participants: product owner, developer, QA lead
- Partly supersedes: ADR-0004, item 4

## Context

The first version of the setting kept the previous Russian translation as the
single default. The product owner clarified that a fresh installation should
first use the language of the device, but only if it is present in the server
catalogue. An unsupported locale must not lead to Russian text.

## Decision

1. On an installation without a valid `meta.scripture_preferences`, take the
   primary locale through `expo-localization.getLocales()[0]`.
2. Match the full `languageTag` first, then the `languageCode` without the
   region, against the aliases from `/api/languages`, case-insensitively.
3. If there is no match, if the catalogue is unavailable, or if the language has
   no complete translation/voice triple, use English `en / 16 / 151`.
4. For the known `ru`, `uk` and `en`, prefer the stable pairs from BibleGarden;
   for the other supported languages take the first translation with an active
   narration in the server order.
5. Save the computed triple. A later change of the device locale does not change
   the explicit or previously computed choice of the user.

## Consequences

- The first launch without a saved choice makes a call to the server catalogue.
- With no network available the app starts deterministically in English and does
  not change the language unexpectedly later.
- `expo-localization` is added as a native SDK 57 dependency and requires a
  rebuild.

## References

- Expo Localization SDK 57: https://docs.expo.dev/versions/v57.0.0/sdk/localization/
