import { create } from 'zustand';
import { getDb } from './db';

// Настройки приложения; хранятся в таблице meta (key/value).
//
// shareAnswers — можно ли отправлять текст ответов на сервер вместе с
// запросами к ИИ (подбор вопросов и мест Писания). По умолчанию выключено:
// пока человек явно не разрешил, его записи не покидают устройство.

type SettingsState = {
  shareAnswers: boolean;
  load: () => Promise<void>;
  setShareAnswers: (v: boolean) => Promise<void>;
};

export const useSettings = create<SettingsState>((set) => ({
  shareAnswers: false,

  load: async () => {
    const d = await getDb();
    const row = await d.getFirstAsync<{ value: string }>(
      "SELECT value FROM meta WHERE key = 'share_answers'",
    );
    set({ shareAnswers: row?.value === '1' });
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
