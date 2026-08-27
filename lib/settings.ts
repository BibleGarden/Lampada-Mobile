import { create } from 'zustand';
import { getDb } from './db';

// Настройки приложения; хранятся в таблице meta (key/value).
//
// shareAnswers управляет только передачей письменных ответов в контекст
// следующих вопросов. Голосовая запись отправляется на расшифровку только
// после отдельного действия пользователя.

type SettingsState = {
  shareAnswers: boolean;
  loaded: boolean;
  load: () => Promise<void>;
  setShareAnswers: (v: boolean) => Promise<void>;
};

let loadPromise: Promise<void> | null = null;

export const useSettings = create<SettingsState>((set) => ({
  shareAnswers: true,
  loaded: false,

  load: async () => {
    if (useSettings.getState().loaded) return;
    if (!loadPromise) {
      loadPromise = (async () => {
        const d = await getDb();
        const row = await d.getFirstAsync<{ value: string }>(
          "SELECT value FROM meta WHERE key = 'share_answers'",
        );
        // Для новых установок записи ещё нет — используем включённое значение
        // по умолчанию. Явно сохранённый "0" остаётся выбором пользователя.
        set({ shareAnswers: row?.value !== '0', loaded: true });
      })().catch((error) => {
        loadPromise = null;
        throw error;
      });
    }
    await loadPromise;
  },

  setShareAnswers: async (v) => {
    set({ shareAnswers: v }); // мгновенно для UI, запись — следом
    const d = await getDb();
    await d.runAsync(
      `INSERT INTO meta (key, value) VALUES ('share_answers', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      v ? '1' : '0',
    );
  },
}));

/** Текущее значение для не-React кода (store), без подписки */
export const shareAnswersNow = () => useSettings.getState().shareAnswers;

/** Privacy barrier for non-React code: persisted opt-out is loaded before networking. */
export const ensureSettingsLoaded = async () => {
  if (!useSettings.getState().loaded) await useSettings.getState().load();
};
