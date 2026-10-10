import SplashHandOver from '../modules/splash-hand-over/src/SplashHandOverModule';

/**
 * Конец передачи системного сплэша приложению (Android 12+, ADR-0040): до него
 * тяжёлый интерфейс не монтируется. Подробности — в modules/splash-hand-over.
 */
export function waitForSplashHandOver(): Promise<void> {
  return SplashHandOver.waitAsync();
}
