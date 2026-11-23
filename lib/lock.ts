import { translate } from './i18n';
import { create } from 'zustand';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import * as LocalAuthentication from 'expo-local-authentication';
import { errorKind, recordDiagnostic, wipeLocalData } from './db';
import { cancelRemindersAsync } from './prayerReminderScheduler';
import { resetSettingsStore } from './settings';
import { resetSessionStore } from './store';
import {
  FALLBACK_PIN_LENGTH,
  PIN_MAX_LENGTH,
  PIN_MIN_LENGTH,
  biometryKind,
  isValidPin,
  parseLockConfig,
  shouldLockAfterBackground,
  type BiometryKind,
  type LockConfig,
} from './lockPolicy';

// Local app lock with a PIN.
//
// The protection is optional and off by default: until the user enables it
// in settings, no screen behaves differently. The PIN is never stored or
// logged — only a random salt and SHA-256(salt + pin) live in the
// Keychain/Keystore. Verifying the PIN is just a hash comparison, so a
// forgotten code cannot be recovered — not by the app, not by anyone with
// access to the storage.
//
// Encrypting the database itself is out of scope here (ADR-0014): the lock
// protects against a stranger's glance at an unlocked phone, not against
// disk extraction.

const KEY_SALT = 'lampada.lock.salt';
const KEY_HASH = 'lampada.lock.hash';
const KEY_ENABLED = 'lampada.lock.enabled';
const KEY_BIOMETRICS = 'lampada.lock.biometrics';
const KEY_LENGTH = 'lampada.lock.length';

const ALL_KEYS = [KEY_SALT, KEY_HASH, KEY_ENABLED, KEY_BIOMETRICS, KEY_LENGTH] as const;

// Rules with no native dependencies live in `lockPolicy.ts` so they can be
// unit-tested outside an emulator. They are still re-exported from here:
// for the other modules `lock.ts` remains the single entry point.
export {
  FALLBACK_PIN_LENGTH,
  LOCK_GRACE_MS,
  PIN_MAX_LENGTH,
  PIN_MIN_LENGTH,
  clampLength,
  isValidPin,
  parseLockConfig,
  shouldLockAfterBackground,
  biometryText,
  type BiometryKind,
  type BiometryText,
  type LockConfig,
} from './lockPolicy';

const toHex = (bytes: Uint8Array) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

/**
 * The PIN hash. The salt is random and unique per install, so equal PINs
 * on different devices yield different hashes and a brute-force table
 * cannot be prepared in advance. The whole PIN is hashed in full,
 * whatever its length.
 */
const hashPin = (salt: string, pin: string) =>
  Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${salt}:${pin}`);

type SecureOperation = 'read' | 'write' | 'delete';

/** Diagnostics get the key name and error kind, never the values. */
const reportSecureFailure = (operation: SecureOperation, key: string, error: unknown) => {
  console.warn('SecureStore operation failed', operation, key, errorKind(error));
  recordDiagnostic('secure_store_failed', { operation, key, errorKind: errorKind(error) });
};

// Reading the secure storage must not crash the app: on a platform without
// SecureStore (web) or with a corrupted record the lock is simply treated
// as disabled — otherwise the user would be locked out of their own data.
const readSecure = async (key: string): Promise<string | null> => {
  try {
    return await SecureStore.getItemAsync(key);
  } catch (error) {
    reportSecureFailure('read', key, error);
    return null;
  }
};

const writeSecure = async (key: string, value: string) => {
  try {
    await SecureStore.setItemAsync(key, value, {
      // The keys must not travel into a backup or another device: the
      // lock is a property of this particular install.
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  } catch (error) {
    reportSecureFailure('write', key, error);
    throw error;
  }
};

// SecureStore deletes a missing key without error, so any failure here is
// real: a protection key would stay on the device after the protection
// was turned off.
const deleteSecure = async (key: string) => {
  try {
    await SecureStore.deleteItemAsync(key);
  } catch (error) {
    reportSecureFailure('delete', key, error);
    throw error;
  }
};

// ---- stored configuration ----

/** Read the protection state. A corrupted or incomplete record = disabled. */
export async function readLockConfig(): Promise<LockConfig> {
  const [enabled, hash, salt, biometrics, length] = await Promise.all([
    readSecure(KEY_ENABLED),
    readSecure(KEY_HASH),
    readSecure(KEY_SALT),
    readSecure(KEY_BIOMETRICS),
    readSecure(KEY_LENGTH),
  ]);
  return parseLockConfig({ enabled, hash, salt, biometrics, length });
}

export async function isLockEnabled(): Promise<boolean> {
  return (await readLockConfig()).enabled;
}

export async function isBiometricsEnabled(): Promise<boolean> {
  return (await readLockConfig()).biometrics;
}

/** The stored PIN length — how many digits the unlock screen expects. */
export async function storedPinLength(): Promise<number> {
  return (await readLockConfig()).pinLength;
}

/** Enable the protection with the given PIN. The PIN itself is never stored. */
export async function enableLock(pin: string): Promise<void> {
  if (!isValidPin(pin)) {
    throw new Error(translate('system.pinLength', { min: PIN_MIN_LENGTH, max: PIN_MAX_LENGTH }));
  }
  const salt = toHex(await Crypto.getRandomBytesAsync(16));
  const hash = await hashPin(salt, pin);
  // Salt, hash, and length are written before the flag: a write
  // interrupted midway leaves the protection disabled, not enabled with an
  // unverifiable PIN.
  await writeSecure(KEY_SALT, salt);
  await writeSecure(KEY_HASH, hash);
  await writeSecure(KEY_LENGTH, String(pin.length));
  await writeSecure(KEY_ENABLED, '1');
  useLock.setState({
    enabled: true,
    locked: false,
    backgroundedAt: null,
    pinLength: pin.length,
  });
}

/** Disable the protection and erase all of its keys. App data is untouched. */
export async function disableLock(): Promise<void> {
  await Promise.all(ALL_KEYS.map(deleteSecure));
  useLock.setState({
    enabled: false,
    biometrics: false,
    locked: false,
    backgroundedAt: null,
    obscured: false,
    pinLength: FALLBACK_PIN_LENGTH,
  });
}

/** Check the entered PIN against the stored hash. */
export async function verifyPin(pin: string): Promise<boolean> {
  if (!isValidPin(pin)) return false;
  const [salt, hash] = await Promise.all([readSecure(KEY_SALT), readSecure(KEY_HASH)]);
  if (!salt || !hash) return false;
  return (await hashPin(salt, pin)) === hash;
}

/** Change the PIN: the new one is accepted only together with the correct current one. */
export async function changePin(currentPin: string, nextPin: string): Promise<boolean> {
  if (!(await verifyPin(currentPin))) return false;
  await enableLock(nextPin);
  return true;
}

/**
 * Enable or disable biometrics. It exists only on top of the PIN: without
 * a PIN there is no fallback way in if the sensor stops recognizing you.
 */
export async function setBiometrics(on: boolean): Promise<void> {
  if (on && !(await isLockEnabled())) return;
  if (on) await writeSecure(KEY_BIOMETRICS, '1');
  else await deleteSecure(KEY_BIOMETRICS);
  useLock.setState({ biometrics: on });
}

// ---- device biometrics ----

export type BiometryInfo = {
  /** A sensor exists and at least one sample is enrolled in the system. */
  available: boolean;
  /** Which method to name in the UI; texts are built by `biometryText`. */
  kind: BiometryKind;
};

/** Which biometrics are available right now; samples may have been removed in the system. */
export async function biometryInfo(): Promise<BiometryInfo> {
  try {
    const [hardware, enrolled, types] = await Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
      LocalAuthentication.supportedAuthenticationTypesAsync(),
    ]);
    return { available: hardware && enrolled, kind: biometryKind(Platform.OS, types) };
  } catch (error) {
    // Without a system answer we do not offer biometrics, but the trace remains.
    console.warn('Biometry check failed', errorKind(error));
    recordDiagnostic('biometry_check_failed', { errorKind: errorKind(error) });
    return { available: false, kind: 'other' };
  }
}

/** The outcome of a system biometric prompt, meaningful to the caller without SDK error codes. */
export type BiometricAuthResult =
  | { ok: true }
  /** The user dismissed the prompt (or the system/app interrupted it) — not an error. */
  | { ok: false; reason: 'cancelled' }
  /** Something prevented the check — the message is ready to show to the person. */
  | { ok: false; reason: 'error'; message: string };

// These three codes are an explicit refusal of the prompt, not a failure:
// the user tapped cancel or enter-PIN, or the prompt was interrupted
// externally (e.g. by backgrounding). Everything else is a real error the
// person should hear about in words rather than silence.
const CANCELLED_BIOMETRIC_ERRORS = new Set<string>(['user_cancel', 'system_cancel', 'app_cancel']);

function describeBiometricError(error: string): string {
  switch (error) {
    case 'not_enrolled':
      return translate('system.notEnrolled');
    case 'not_available':
      return translate('system.notAvailable');
    case 'passcode_not_set':
      return translate('system.noPasscode');
    case 'lockout':
      return translate('system.lockout');
    case 'authentication_failed':
      return translate('system.authFailed');
    case 'timeout':
      return translate('system.timeout');
    default:
      return translate('system.authError');
  }
}

/**
 * The system biometric prompt. Device-passcode fallback is disabled: our
 * fallback path is the app's own PIN, and it must not be replaced by the
 * phone's unlock code that everyone at home knows.
 *
 * A refusal must never be silent: the caller gets more than `false` and
 * can tell a user cancellation from a real error with a ready-to-show
 * message.
 */
export async function authenticateWithBiometrics(
  promptMessage: string,
): Promise<BiometricAuthResult> {
  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage,
      cancelLabel: translate('system.enterPin'),
      fallbackLabel: '',
      disableDeviceFallback: true,
    });
    if (result.success) return { ok: true };
    if (CANCELLED_BIOMETRIC_ERRORS.has(result.error)) return { ok: false, reason: 'cancelled' };
    return { ok: false, reason: 'error', message: describeBiometricError(result.error) };
  } catch (error) {
    // `missing_usage_description` (Info.plist not configured) also lands
    // here — on the user's device it looks like any other system-prompt
    // failure and must be said in words, not swallowed.
    const raw = error instanceof Error ? error.message : '';
    const message = /usage description/i.test(raw)
      ? translate('system.facePermission')
      : translate('system.authError');
    return { ok: false, reason: 'error', message };
  }
}

// ---- full wipe ----

export type WipeResult = { remindersCancelled: boolean };

/**
 * Forgotten-PIN reset. The code cannot be recovered, so the only way out
 * is to erase everything: the journal, audio recordings, favorites,
 * settings, and the protection keys themselves. The screen calls this only
 * after two explicit confirmations.
 *
 * A failure to cancel system reminders does not stop the wipe (otherwise a
 * forgotten PIN could never be reset at all) but is returned to the screen
 * so the person learns the wipe was incomplete.
 */
export async function wipeEverything(): Promise<WipeResult> {
  // A data deletion failure changes neither the keys nor the live protection state.
  await wipeLocalData();
  // The reminder schedule lives in the system, not only in the database:
  // unless cancelled, the app would keep notifying per the erased schedule.
  let remindersError: unknown = null;
  let remindersCancelled = true;
  let keysDeleted = false;
  try {
    try {
      await cancelRemindersAsync();
    } catch (error) {
      remindersCancelled = false;
      remindersError = error;
    }
    if (!remindersCancelled) {
      // Written after wipeLocalData: the wipe deletes the diagnostic log too.
      console.error('Wipe could not cancel prayer reminders', errorKind(remindersError));
      recordDiagnostic('wipe_incomplete', { step: 'reminders', errorKind: errorKind(remindersError) });
    }
    await Promise.all(ALL_KEYS.map(deleteSecure));
    keysDeleted = true;
  } finally {
    // Even if SecureStore kept a key, memory must not reference the
    // already erased sessions and consents. LockGate stays until all keys
    // are successfully deleted: the "Forgot PIN?" flow can then be retried
    // over empty data.
    resetSettingsStore();
    resetSessionStore();
    useLock.setState({
      ready: true,
      enabled: !keysDeleted,
      biometrics: false,
      locked: !keysDeleted,
      obscured: false,
      backgroundedAt: null,
      pinLength: FALLBACK_PIN_LENGTH,
    });
  }
  return { remindersCancelled };
}

// ---- lock screen state ----

type LockState = {
  /** The config is loaded; until then no content may be shown. */
  ready: boolean;
  enabled: boolean;
  biometrics: boolean;
  locked: boolean;
  /** Privacy shade: the app is inactive, a snapshot must not reveal the journal. */
  obscured: boolean;
  backgroundedAt: number | null;
  /** How many digits the unlock screen expects. */
  pinLength: number;

  load: () => Promise<void>;
  unlock: () => void;
  lock: () => void;
  noteBackground: (nowMs?: number) => void;
  noteInactive: () => void;
  noteActive: (nowMs?: number) => void;
};

export const useLock = create<LockState>((set, get) => ({
  ready: false,
  enabled: false,
  biometrics: false,
  locked: false,
  obscured: false,
  backgroundedAt: null,
  pinLength: FALLBACK_PIN_LENGTH,

  load: async () => {
    const config = await readLockConfig();
    // A cold start with the protection enabled always begins at the PIN screen.
    set({
      ready: true,
      enabled: config.enabled,
      biometrics: config.biometrics,
      pinLength: config.pinLength,
      locked: config.enabled,
      backgroundedAt: null,
    });
  },

  unlock: () => set({ locked: false, backgroundedAt: null }),

  lock: () => set((s) => (s.enabled ? { locked: true } : s)),

  noteInactive: () => set((s) => (s.enabled ? { obscured: true } : s)),

  noteBackground: (nowMs = Date.now()) =>
    set((s) =>
      s.enabled
        ? // The clock starts at the first backgrounding: an inactive →
          // background chain must not keep pushing the reference point forward.
          { obscured: true, backgroundedAt: s.backgroundedAt ?? nowMs }
        : s,
    ),

  noteActive: (nowMs = Date.now()) => {
    const s = get();
    if (!s.enabled) {
      if (s.obscured) set({ obscured: false });
      return;
    }
    set({
      obscured: false,
      locked: s.locked || shouldLockAfterBackground(s.backgroundedAt, nowMs),
      backgroundedAt: null,
    });
  },
}));
