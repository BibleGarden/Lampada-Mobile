/**
 * Конец передачи нативного сплэша приложению. На iOS передачи нет: экран
 * запуска expo-splash-screen — обычный вид поверх корневого, и hide() убирает
 * его сам. Android — в splashHandOver.android.ts.
 */
export async function waitForSplashHandOver(): Promise<void> {}
