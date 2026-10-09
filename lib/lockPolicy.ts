// Чистые правила блокировки пин-кодом: длина кода, проверка ввода, окно
// возврата из фона и разбор сохранённой конфигурации.
//
// Модуль намеренно не знает ни про SecureStore, ни про zustand, ни про
// react-native: сами правила — арифметика и разбор строк, и их хочется
// проверять юнит-тестами в обычном node, без эмулятора и моков нативных
// модулей. Всё, что умеет хранить и шифровать, живёт в `lock.ts`, который
// реэкспортирует эти сущности наружу.

/** Пин-код — от четырёх до восьми цифр; длину выбирает пользователь. */
export const PIN_MIN_LENGTH = 4;
export const PIN_MAX_LENGTH = 8;

/**
 * Длина по умолчанию — на случай, если запись длины потерялась, а хэш остался.
 * Экран разблокировки тогда покажет минимальное число точек и будет проверять
 * ввод на каждой цифре начиная с четвёртой.
 */
export const FALLBACK_PIN_LENGTH = PIN_MIN_LENGTH;

/**
 * Сколько приложение может пробыть в фоне, не запрашивая пин. Быстрое
 * «свернул — развернул» (ответить на сообщение, посмотреть время) не должно
 * превращаться в ввод кода, а через минуту телефон уже мог сменить руки.
 */
export const LOCK_GRACE_MS = 60_000;

/** Пин допустимой длины из одних цифр. */
export const isValidPin = (pin: string) =>
  new RegExp(`^\\d{${PIN_MIN_LENGTH},${PIN_MAX_LENGTH}}$`).test(pin);

export const clampLength = (value: number) =>
  Math.min(PIN_MAX_LENGTH, Math.max(PIN_MIN_LENGTH, value));

/** Пора ли снова спрашивать пин после возвращения из фона. */
export const shouldLockAfterBackground = (backgroundedAt: number | null, nowMs: number) =>
  backgroundedAt !== null && nowMs - backgroundedAt >= LOCK_GRACE_MS;

// ---- хранимая конфигурация ----

export type LockConfig = {
  enabled: boolean;
  biometrics: boolean;
  /** Длина сохранённого пина: столько точек показывает экран разблокировки. */
  pinLength: number;
};

/** Сырые записи защищённого хранилища: отсутствующий ключ приходит как null. */
export type RawLockConfig = Record<
  'enabled' | 'hash' | 'salt' | 'biometrics' | 'length',
  string | null
>;

/** Разобрать записи хранилища. Повреждённая или неполная запись = выключено. */
export function parseLockConfig({
  enabled,
  hash,
  salt,
  biometrics,
  length,
}: RawLockConfig): LockConfig {
  // Без соли и хэша проверить пин нечем, поэтому флаг сам по себе ничего не
  // значит: неполная запись равнозначна выключенной защите.
  const on = enabled === '1' && !!hash && !!salt;
  const parsed = Number.parseInt(length ?? '', 10);
  return {
    enabled: on,
    biometrics: on && biometrics === '1',
    pinLength: Number.isFinite(parsed) ? clampLength(parsed) : FALLBACK_PIN_LENGTH,
  };
}

// ---- название биометрии ----

/** Какой способ называть; `other` — несколько датчиков или тип неизвестен. */
export type BiometryKind = 'face' | 'finger' | 'other';

/** Где звучит название способа: строка настроек, системный запрос, ошибка, экран блокировки. */
export type BiometryText = 'label' | 'confirm' | 'enableError' | 'orUnlock' | 'unlock';

// Значения AuthenticationType из expo-local-authentication.
const FINGERPRINT = 1;
const FACIAL_RECOGNITION = 2;

/**
 * Способ по типам, которые сообщила система. На iOS датчик один. Android
 * перечисляет аппаратные возможности, а системный запрос (уровень `weak`)
 * сам выбирает среди зарегистрированных образцов, поэтому конкретное название
 * верно, только когда тип ровно один; иначе — общее слово, как у самого Android.
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
 * Текст про биометрию. Face ID и Touch ID — несклоняемые названия Apple и
 * подставляются в общий шаблон только на iOS. На Android у каждого способа
 * своя готовая фраза: «отпечаток пальца» в шаблоне «Войти через {name}»
 * не согласуется по падежу.
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
