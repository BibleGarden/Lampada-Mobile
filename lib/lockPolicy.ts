// Pure PIN-lock rules: code length, input validation, the background
// re-entry window, and parsing the stored configuration.
//
// The module deliberately knows nothing about SecureStore, zustand, or
// react-native: the rules themselves are arithmetic and string parsing,
// and we want to unit-test them in plain node, without an emulator or
// native-module mocks. Everything that stores and encrypts lives in
// `lock.ts`, which re-exports these entities.

/** The PIN is four to eight digits; the user picks the length. */
export const PIN_MIN_LENGTH = 4;
export const PIN_MAX_LENGTH = 8;

/**
 * The default length, for when the length record is lost but the hash
 * remains. The unlock screen then shows the minimum number of dots and
 * validates the input at every digit from the fourth on.
 */
export const FALLBACK_PIN_LENGTH = PIN_MIN_LENGTH;

/**
 * How long the app may stay in the background without asking for the PIN.
 * A quick background-and-return (answer a message, check the time) must
 * not turn into a code entry, while after a minute the phone could have
 * changed hands.
 */
export const LOCK_GRACE_MS = 60_000;

/** A PIN of a valid length made of digits only. */
export const isValidPin = (pin: string) =>
  new RegExp(`^\\d{${PIN_MIN_LENGTH},${PIN_MAX_LENGTH}}$`).test(pin);

export const clampLength = (value: number) =>
  Math.min(PIN_MAX_LENGTH, Math.max(PIN_MIN_LENGTH, value));

/** Whether to ask for the PIN again after returning from the background. */
export const shouldLockAfterBackground = (backgroundedAt: number | null, nowMs: number) =>
  backgroundedAt !== null && nowMs - backgroundedAt >= LOCK_GRACE_MS;

// ---- stored configuration ----

export type LockConfig = {
  enabled: boolean;
  biometrics: boolean;
  /** The stored PIN's length: that many dots the unlock screen shows. */
  pinLength: number;
};

/** Raw secure-storage records: a missing key arrives as null. */
export type RawLockConfig = Record<
  'enabled' | 'hash' | 'salt' | 'biometrics' | 'length',
  string | null
>;

/** Parse the storage records. A corrupted or incomplete record = disabled. */
export function parseLockConfig({
  enabled,
  hash,
  salt,
  biometrics,
  length,
}: RawLockConfig): LockConfig {
  // Without a salt and hash there is nothing to verify the PIN against, so
  // the flag alone means nothing: an incomplete record equals a disabled
  // protection.
  const on = enabled === '1' && !!hash && !!salt;
  const parsed = Number.parseInt(length ?? '', 10);
  return {
    enabled: on,
    biometrics: on && biometrics === '1',
    pinLength: Number.isFinite(parsed) ? clampLength(parsed) : FALLBACK_PIN_LENGTH,
  };
}

// ---- biometrics naming ----

/** Which method to name; `other` — several sensors or an unknown type. */
export type BiometryKind = 'face' | 'finger' | 'other';

/** Where the method name appears: the settings row, system prompt, error, lock screen. */
export type BiometryText = 'label' | 'confirm' | 'enableError' | 'orUnlock' | 'unlock';

// AuthenticationType values from expo-local-authentication.
const FINGERPRINT = 1;
const FACIAL_RECOGNITION = 2;

/**
 * The method derived from the types the system reported. iOS has a single
 * sensor. Android enumerates hardware capabilities while the system prompt
 * (`weak` class) picks among the enrolled samples itself, so a specific
 * name is correct only when there is exactly one type; otherwise a
 * generic word, as Android itself uses.
 */
export function biometryKind(platform: string, types: readonly number[]): BiometryKind {
  if (platform === 'ios') {
    return types.includes(FACIAL_RECOGNITION) ? 'face' : types.includes(FINGERPRINT) ? 'finger' : 'other';
  }
  if (types.length !== 1) return 'other';
  return types[0] === FACIAL_RECOGNITION ? 'face' : types[0] === FINGERPRINT ? 'finger' : 'other';
}

const APPLE_NAMES: Record<BiometryKind, string> = {
  face: 'Face ID', finger: 'Touch ID', other: 'Face ID / Touch ID',
};

const APPLE_TEMPLATES: Record<Exclude<BiometryText, 'label'>, string> = {
  confirm: 'settings.confirmBiometrics',
  enableError: 'settings.biometricsError',
  orUnlock: 'components.security.orBiometrics',
  unlock: 'components.security.useBiometrics',
};

/**
 * Biometrics text. Face ID and Touch ID are indeclinable Apple names and
 * are substituted into the shared template on iOS only. On Android each
 * method has its own ready-made phrase: a "fingerprint" substituted into
 * the "Sign in with {name}" template would not inflect correctly.
 */
export function biometryText(
  platform: string, kind: BiometryKind, text: BiometryText,
  translate: (key: string, params?: Record<string, string>) => string,
): string {
  if (platform === 'ios') {
    return text === 'label' ? APPLE_NAMES[kind] : translate(APPLE_TEMPLATES[text], { name: APPLE_NAMES[kind] });
  }
  return translate(`system.biometry.${text}.${kind}`);
}
