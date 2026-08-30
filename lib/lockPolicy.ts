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
