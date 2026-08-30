import { Platform } from 'react-native';
import type { ViewProps } from 'react-native';

// Скрытие контента от программ чтения с экрана, пока сверху висит оверлей.
//
// На iOS это делает сам оверлей флагом `accessibilityViewIsModal`: VoiceOver
// перестаёт видеть всё, что лежит вне модального узла, и помечать содержимое
// под оверлеем не нужно. У Android такого флага нет — TalkBack ходит по всему
// дереву и читает сиблингов оверлея, — поэтому там пометку приходится ставить
// с другой стороны: на самом скрываемом поддереве.
//
// Отсюда и форма: набор пропов, который на iOS пустой (поведение не меняется
// ни на кадр), а на Android помечает поддерево `no-hide-descendants`.

/**
 * Пропы для контейнера, который надо спрятать от TalkBack, пока `hidden`.
 *
 * `collapsable: false` стоит постоянно, а не только под оверлеем: Android
 * схлопывает вью-обёртку без собственных свойств, и в нативном дереве не
 * остаётся узла, на котором держится пометка. Постоянный флаг ещё и не даёт
 * пересоздавать нативное поддерево на каждом включении оверлея — иначе экраны
 * под шторкой теряли бы позицию прокрутки и перезапускали анимации.
 */
export function screenReaderHiddenProps(
  hidden: boolean,
): Pick<ViewProps, 'collapsable' | 'importantForAccessibility'> {
  if (Platform.OS !== 'android') return {};
  return {
    collapsable: false,
    importantForAccessibility: hidden ? 'no-hide-descendants' : 'auto',
  };
}
