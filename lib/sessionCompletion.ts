import type { ScriptureAudioPhase } from './useScriptureAudio';

type CompletionState = {
  remaining: number | null;
  answerOpen: boolean;
  scripturePhase: ScriptureAudioPhase;
};

export function createSessionCompletion(onFinish: () => void) {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  let finished = false;
  let waitedForScripture = false;

  const cancel = () => {
    if (timeout !== null) clearTimeout(timeout);
    timeout = null;
  };

  const finish = () => {
    if (finished) return;
    finished = true;
    cancel();
    onFinish();
  };

  const update = ({ remaining, answerOpen, scripturePhase }: CompletionState) => {
    if (finished) return;
    if (remaining !== 0) {
      cancel();
      waitedForScripture = false;
      return;
    }

    // Пауза и загрузка сохраняют возможность дослушать. Ошибка остаётся
    // видимой, пока пользователь не повторит попытку или не завершит молитву.
    if (scripturePhase !== 'idle') waitedForScripture = true;
    if (answerOpen || scripturePhase !== 'idle') {
      cancel();
      return;
    }

    if (timeout !== null) return;
    timeout = setTimeout(finish, waitedForScripture ? 3_000 : 400);
  };

  return { update, finish, cancel };
}
