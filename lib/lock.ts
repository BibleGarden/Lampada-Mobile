import { create } from 'zustand';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import * as LocalAuthentication from 'expo-local-authentication';
import { wipeLocalData } from './db';
import { cancelRemindersAsync } from './prayerReminderScheduler';
import { resetSettingsStore } from './settings';
import { resetSessionStore } from './store';
import {
  FALLBACK_PIN_LENGTH,
  PIN_MAX_LENGTH,
  PIN_MIN_LENGTH,
  isValidPin,
  parseLockConfig,
  shouldLockAfterBackground,
  type LockConfig,
} from './lockPolicy';

// Локальная блокировка приложения пин-кодом.
//
// Защита опциональна и по умолчанию выключена: пока пользователь не включил её
// в настройках, ни один экран не ведёт себя иначе. Пин-код нигде не хранится и
// не логируется — в Keychain/Keystore лежат только случайная соль и
// SHA-256(соль + пин). Проверка пина сводится к сравнению хэшей, поэтому
// восстановить забытый код невозможно ни приложению, ни тому, кто получил
// доступ к хранилищу.
//
// Шифрование самой базы данных сюда не входит (ADR-0014): блокировка защищает
// от чужого взгляда в разблокированный телефон, а не от извлечения диска.

const KEY_SALT = 'lampada.lock.salt';
const KEY_HASH = 'lampada.lock.hash';
const KEY_ENABLED = 'lampada.lock.enabled';
const KEY_BIOMETRICS = 'lampada.lock.biometrics';
const KEY_LENGTH = 'lampada.lock.length';

const ALL_KEYS = [KEY_SALT, KEY_HASH, KEY_ENABLED, KEY_BIOMETRICS, KEY_LENGTH] as const;

// Правила без нативных зависимостей вынесены в `lockPolicy.ts`, чтобы их можно
// было проверять юнит-тестами вне эмулятора. Наружу они по-прежнему видны
// отсюда: для остальных модулей `lock.ts` остаётся единственной точкой входа.
export {
  FALLBACK_PIN_LENGTH,
  LOCK_GRACE_MS,
  PIN_MAX_LENGTH,
  PIN_MIN_LENGTH,
  clampLength,
  isValidPin,
  parseLockConfig,
  shouldLockAfterBackground,
  type LockConfig,
} from './lockPolicy';

const toHex = (bytes: Uint8Array) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

/**
 * Хэш пина. Соль случайна и уникальна для установки, поэтому одинаковые пины на
 * разных устройствах дают разные хэши, а перебор нельзя подготовить заранее.
 * Хэшируется полный пин целиком, какой бы длины он ни был.
 */
const hashPin = (salt: string, pin: string) =>
  Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${salt}:${pin}`);

// Чтение защищённого хранилища не должно ронять приложение: на платформе без
// SecureStore (web) и при повреждённой записи блокировка просто считается
// выключенной — иначе пользователь остался бы без доступа к своим данным.
const readSecure = async (key: string): Promise<string | null> => {
  try {
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
};

const writeSecure = (key: string, value: string) =>
  SecureStore.setItemAsync(key, value, {
    // Ключи не должны уезжать в резервную копию и на другое устройство:
    // блокировка — свойство именно этой установки.
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });

const deleteSecure = async (key: string) => {
  try {
    await SecureStore.deleteItemAsync(key);
  } catch {
    // Отсутствующий ключ — не ошибка: цель вызова уже достигнута.
  }
};

// ---- хранимая конфигурация ----

/** Прочитать состояние защиты. Повреждённая или неполная запись = выключено. */
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

/** Сохранённая длина пина — сколько цифр ждёт экран разблокировки. */
export async function storedPinLength(): Promise<number> {
  return (await readLockConfig()).pinLength;
}

/** Включить защиту с указанным пином. Сам пин никуда не сохраняется. */
export async function enableLock(pin: string): Promise<void> {
  if (!isValidPin(pin)) {
    throw new Error(`Пин-код должен состоять из ${PIN_MIN_LENGTH}–${PIN_MAX_LENGTH} цифр`);
  }
  const salt = toHex(await Crypto.getRandomBytesAsync(16));
  const hash = await hashPin(salt, pin);
  // Соль, хэш и длина пишутся до флага: прерванная на середине запись оставит
  // защиту выключенной, а не включённой с непроверяемым пином.
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

/** Выключить защиту и стереть все её ключи. Данные приложения не трогаются. */
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

/** Сверить введённый пин с сохранённым хэшем. */
export async function verifyPin(pin: string): Promise<boolean> {
  if (!isValidPin(pin)) return false;
  const [salt, hash] = await Promise.all([readSecure(KEY_SALT), readSecure(KEY_HASH)]);
  if (!salt || !hash) return false;
  return (await hashPin(salt, pin)) === hash;
}

/** Сменить пин: новый принимается только вместе с верным текущим. */
export async function changePin(currentPin: string, nextPin: string): Promise<boolean> {
  if (!(await verifyPin(currentPin))) return false;
  await enableLock(nextPin);
  return true;
}

/**
 * Включить или выключить биометрию. Она существует только поверх пина: без
 * пин-кода нет и запасного способа войти, если Face ID перестанет узнавать.
 */
export async function setBiometrics(on: boolean): Promise<void> {
  if (on && !(await isLockEnabled())) return;
  if (on) await writeSecure(KEY_BIOMETRICS, '1');
  else await deleteSecure(KEY_BIOMETRICS);
  useLock.setState({ biometrics: on });
}

// ---- биометрия устройства ----

export type BiometryInfo = {
  /** Датчик есть и в системе зарегистрирован хотя бы один образец. */
  available: boolean;
  /** Название способа на языке устройства: «Face ID», «Отпечаток пальца». */
  label: string;
};

const DEFAULT_BIOMETRY_LABEL = 'Face ID / Touch ID';

/** Что за биометрия доступна прямо сейчас; образцы могли удалить в системе. */
export async function biometryInfo(): Promise<BiometryInfo> {
  try {
    const [hardware, enrolled, types] = await Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
      LocalAuthentication.supportedAuthenticationTypesAsync(),
    ]);
    const face = types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION);
    const finger = types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT);
    const ios = Platform.OS === 'ios';
    const label = face
      ? ios ? 'Face ID' : 'Распознавание лица'
      : finger
        ? ios ? 'Touch ID' : 'Отпечаток пальца'
        : DEFAULT_BIOMETRY_LABEL;
    return { available: hardware && enrolled, label };
  } catch {
    return { available: false, label: DEFAULT_BIOMETRY_LABEL };
  }
}

/** Итог системного запроса биометрии, понятный вызывающему без знания кодов SDK. */
export type BiometricAuthResult =
  | { ok: true }
  /** Пользователь сам прервал запрос (или его прервала система/приложение) — не ошибка. */
  | { ok: false; reason: 'cancelled' }
  /** Что-то помешало пройти проверку — текст уже готов для показа человеку. */
  | { ok: false; reason: 'error'; message: string };

// Эти три кода — явный отказ от запроса, а не сбой: пользователь нажал
// «Отмена»/«Ввести пин-код», либо систему/приложение прервало извне
// (например, сворачиванием). Всё остальное — реальная ошибка, о которой стоит
// сказать человеку словами, а не молчать.
const CANCELLED_BIOMETRIC_ERRORS = new Set<string>(['user_cancel', 'system_cancel', 'app_cancel']);

function describeBiometricError(error: string): string {
  switch (error) {
    case 'not_enrolled':
      return 'В системе не сохранено ни одного лица или отпечатка. Добавьте его в настройках устройства.';
    case 'not_available':
      return 'Биометрия недоступна на этом устройстве.';
    case 'passcode_not_set':
      return 'На устройстве не задан код блокировки, поэтому биометрия недоступна.';
    case 'lockout':
      return 'Слишком много неудачных попыток. Биометрия временно заблокирована — попробуйте позже или введите пин-код.';
    case 'authentication_failed':
      return 'Не удалось распознать лицо или отпечаток. Попробуйте ещё раз.';
    case 'timeout':
      return 'Время ожидания истекло. Попробуйте ещё раз.';
    default:
      return 'Не удалось выполнить проверку биометрии на этом устройстве.';
  }
}

/**
 * Системный запрос биометрии. Возврат к паролю устройства отключён: запасной
 * путь у нас свой — пин-код приложения, и он не должен подменяться кодом
 * разблокировки телефона, который знают все домашние.
 *
 * Отказ никогда не должен быть немым: вызывающий получает не просто `false`,
 * а различает отмену пользователем и настоящую ошибку с готовым для показа
 * текстом.
 */
export async function authenticateWithBiometrics(
  promptMessage: string,
): Promise<BiometricAuthResult> {
  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage,
      cancelLabel: 'Ввести пин-код',
      fallbackLabel: '',
      disableDeviceFallback: true,
    });
    if (result.success) return { ok: true };
    if (CANCELLED_BIOMETRIC_ERRORS.has(result.error)) return { ok: false, reason: 'cancelled' };
    return { ok: false, reason: 'error', message: describeBiometricError(result.error) };
  } catch (error) {
    // Сюда попадает и `missing_usage_description` (не настроен Info.plist) —
    // на устройстве пользователя это выглядит так же, как любой другой сбой
    // системного запроса, и должно быть сказано словами, а не проглочено.
    const raw = error instanceof Error ? error.message : '';
    const message = /usage description/i.test(raw)
      ? 'Приложению не хватает разрешения на использование Face ID. Обновите приложение и попробуйте снова.'
      : 'Не удалось выполнить проверку биометрии на этом устройстве.';
    return { ok: false, reason: 'error', message };
  }
}

// ---- полное стирание ----

/**
 * Сброс забытого пина. Восстановить код нельзя, поэтому единственный выход —
 * стереть всё: дневник, аудиозаписи, избранное, настройки и сами ключи защиты.
 * Экран вызывает это только после двух явных подтверждений.
 */
export async function wipeEverything(): Promise<void> {
  // Расписание напоминаний живёт в системе, а не только в базе: не сняв его,
  // приложение продолжало бы напоминать по стёртому расписанию.
  await cancelRemindersAsync().catch(() => undefined);
  await wipeLocalData();
  await Promise.all(ALL_KEYS.map(deleteSecure));
  resetSettingsStore();
  resetSessionStore();
  useLock.setState({
    ready: true,
    enabled: false,
    biometrics: false,
    locked: false,
    obscured: false,
    backgroundedAt: null,
    pinLength: FALLBACK_PIN_LENGTH,
  });
}

// ---- состояние экрана блокировки ----

type LockState = {
  /** Конфигурация прочитана; до этого момента контент показывать нельзя. */
  ready: boolean;
  enabled: boolean;
  biometrics: boolean;
  locked: boolean;
  /** Шторка приватности: приложение неактивно, снимок не должен видеть дневник. */
  obscured: boolean;
  backgroundedAt: number | null;
  /** Сколько цифр ждёт экран разблокировки. */
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
    // Холодный старт при включённой защите всегда начинается с экрана пина.
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
        ? // Отсчёт ведётся от первого ухода в фон: цепочка inactive → background
          // не должна каждый раз сдвигать точку отсчёта вперёд.
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
