# ADR-0014: Lock the app with a local PIN whose hash lives in the Keychain, with biometrics on top of it

- Status: Accepted
- Date: 2026-08-30
- Participants: product owner, developer, QA lead

## Context

The prayer journal is the most personal content in the app: the prayer topic, the
written answers, the voice recordings. A phone is often handed to another person
already unlocked, and at that moment there is nothing between them and the
journal.

Constraints and facts that shape the decision:

- All the app data is local: the SQLite `lampada.db` and the audio files in the
  document directory. There is no server account, so there is nowhere - and no
  reason - to recover a code through email or SMS.
- The app must not change its behaviour for those who do not need protection: a
  prayer starts with a single tap, and an extra screen at the entrance
  contradicts the idea.
- iOS captures a screenshot when the app goes to the background and shows it in
  the app switcher. Without a privacy screen an open journal is visible to
  anyone flipping through the tasks.
- `expo-secure-store` puts values into the Keychain (iOS) and into
  Keystore-encrypted `SharedPreferences` (Android). `expo-local-authentication`
  gives Face ID, Touch ID and fingerprint, but gives no key at all: it only
  returns yes or no.
- A screen that can be reached by navigation can also be bypassed - by a deep
  link on `scheme: lampada`, by going back, or by tapping a reminder (ADR-0013).

## Decision

1. The protection is optional and off by default. Until the user turns it on in
   the settings, not a single screen, scenario or launch changes.
2. The base method is a PIN of 4 to 8 digits; the user chooses the length. During
   setup and change the user finishes the input with a confirmation button:
   auto-validating on the fourth digit would make a longer code impossible to
   type.
3. The PIN is neither stored nor logged anywhere. SecureStore holds a random salt
   (16 bytes from `expo-crypto`), `SHA-256(salt + pin)`, the enabled flag, the
   biometrics flag and the PIN length. Verification is a comparison of hashes.
   The length is stored alongside because the unlock screen has to know how many
   dots to show and on which digit to validate the input; it does not reveal the
   code itself.
4. The keys are written with `WHEN_UNLOCKED_THIS_DEVICE_ONLY`: the lock is a
   property of a particular installation and must not travel into a backup or
   onto another device. The `expo-secure-store` config plugin excludes the
   records from Android Auto Backup, otherwise the restored values would fail to
   decrypt while the enabled flag would survive - and the person would not get
   into their own app.
5. An incomplete record is equivalent to protection being off: without the salt
   or the hash the `enabled` flag means nothing. A storage read error is treated
   as "off" too - otherwise a SecureStore failure would cut access to the data
   off forever.
6. Biometrics is a separate toggle strictly on top of the PIN, available only
   when the sensor exists and a sample is enrolled. It does not replace the PIN,
   it speeds the entry up: the PIN stays the only fallback if Face ID stops
   recognising the person. `disableDeviceFallback: true` - falling back to the
   phone passcode is disabled: that code is usually known to the same household
   the journal is being closed from.
7. The lock engages on a cold start and on returning from the background, if at
   least 60 seconds were spent there. The countdown starts at the first
   transition to `background` and is not shifted by an `inactive → background`
   chain. A quick "minimise and restore" needs no code.
8. On `inactive` and `background` a privacy screen is shown over the app - the
   background and the name, without any content - so that the snapshot in the app
   switcher does not capture the journal.
9. The gate lives in the root `app/_layout.tsx` as a conditional overlay above
   the `Stack` rather than as a separate route: an overlay above the whole
   navigation cannot be bypassed by a transition, by a deep link or by tapping a
   reminder.
10. Until the configuration has been read from SecureStore, the same screen is
    shown: otherwise, with protection enabled, the journal would flash on the
    first frame.
11. A forgotten PIN cannot be recovered. The only way out is a full wipe:
    deleting the database file through `deleteDatabaseAsync`, deleting the audio
    files, cancelling the scheduled reminders, clearing the SecureStore keys and
    resetting the in-memory stores. The action requires two explicit
    confirmations in a row.
12. Encrypting the database and the audio files on disk is out of scope.

## Options considered

### Store the PIN itself in SecureStore and compare strings

Rejected. The Keychain and the Keystore do protect a value, but there is no point
storing a recoverable secret where a hash is enough: if the storage or a backup
were compromised, the PIN would leak in its original form, and people reuse
codes.

### Biometrics as the only way in, without a PIN

Rejected. Face ID stops recognising a person in a mask, in the dark, after an
injury and when the enrolled sample changes. Without a PIN the only way out would
be a reset with a full data wipe - a disproportionate price for a failed
recognition.

### `requireAuthentication: true` on the SecureStore record itself

Rejected. The option ties the record to biometrics at the storage level: changing
the set of enrolled samples in the system invalidates the key, and the PIN would
stop being verifiable - the user would lose access to their data because of a
face setting rather than a code. We keep biometrics as a separate optional
accelerator above an independent hash.

### The lock screen as a separate expo-router route

Rejected. A route is part of the navigation, which means it is reachable around
as well: a deep link on `lampada://`, a `router.back()` from the history or a tap
on a reminder would bring the user back to the protected screen. An overlay above
the `Stack` has no such holes.

### A fixed 4 digits

Rejected by the product owner: a four-digit code is brute-forced in 10,000
attempts, and a person who wants a longer code has nothing to be offered. A
variable length of 4 to 8 costs one stored number and one confirmation button.

### A password instead of a numeric code

Rejected. The app is opened several times a day for short prayers; an alphabetic
password at the entrance costs more than the risk it protects against. A numeric
keypad stays fast and matches the tone of the rest of the interface.

### Resetting the PIN without wiping the data

Rejected. Any such path - a "secret question", a support code, a bypass through
system biometrics - is a door around the protection itself, and it would be open
to exactly the person it was protecting against. Since the PIN cannot be
recovered, the honest price of getting in without it is the loss of the data,
which is warned about twice.

### Encrypting `lampada.db` with a key derived from the PIN

Rejected as a separate future scope. It would protect against extracting the disk
and reading the file around the app, but it requires SQLCipher or manual field
encryption, re-encryption when the PIN changes, and it makes losing the PIN an
unconditional loss of data even in scenarios unrelated to the lock. The current
threat is an unlocked phone in someone else's hands, and the gate protects
against it.

## Consequences

- A user who does not need the protection never notices it exists: the path to a
  prayer has not changed.
- A forgotten PIN means the loss of all data. This is accepted deliberately and
  stated to the user explicitly, both in the settings and in both confirmations
  of the reset.
- The data on disk stays unencrypted: the owner of an unlocked computer with
  access to a backup or to the device file system will read the journal around
  the app. The gate does not protect against that.
- The privacy screen is shown on a short `inactive` too - with the Control Centre
  shade and a notification banner. That is the price of keeping the journal out
  of the app switcher snapshot.
- The native dependencies `expo-secure-store`, `expo-local-authentication` and
  `expo-crypto` were added, so verifying the lock requires a new native build
  rather than only a JS bundle update. Face ID does not work in Expo Go.
- The full wipe is the only place in the app that deletes the database file
  outright. The schema is recreated by the ordinary migration on the very next
  access.

## References

- [ADR-0013](0013-local-prayer-reminders.md) - the reminders, whose tap must not
  lead around the lock screen either
- [expo-secure-store, Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/sdk/securestore/)
- [expo-local-authentication, Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/sdk/local-authentication/)
- `lib/lock.ts`, `components/LockGate.tsx`, `components/PinPad.tsx`, `components/PinPrompt.tsx`
