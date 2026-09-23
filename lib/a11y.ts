import type { ViewProps } from 'react-native';

// Скрытие контента от программ чтения с экрана, пока сверху висит оверлей
// или шторка, а также закрытой шторки, уехавшей за нижний край.
//
// `accessibilityViewIsModal` у оверлея здесь не замена: VoiceOver по нему
// отбрасывает только сиблингов модального узла, а шторки `@gorhom/bottom-sheet`
// рендерятся сиблингами экрана через фрагмент, и флаг на их содержимое не
// доходит до экрана. TalkBack такого флага не знает вовсе. Закрытая шторка
// лишь сдвинута трансформацией и без пометки остаётся в порядке обхода.
// Поэтому пометку ставим на самом скрываемом поддереве, на обеих платформах.

/**
 * Пропы для контейнера, который надо спрятать от VoiceOver и TalkBack, пока
 * `hidden`.
 *
 * `collapsable: false` стоит постоянно, а не только под оверлеем: Fabric
 * схлопывает вью-обёртку без собственных свойств, и в нативном дереве не
 * остаётся узла, на котором держится пометка. Постоянный флаг ещё и не даёт
 * пересоздавать нативное поддерево на каждом включении оверлея — иначе экраны
 * под шторкой теряли бы позицию прокрутки и перезапускали анимации.
 */
export function screenReaderHiddenProps(
  hidden: boolean,
): Pick<ViewProps, 'collapsable' | 'accessibilityElementsHidden' | 'importantForAccessibility'> {
  return {
    collapsable: false,
    accessibilityElementsHidden: hidden,
    importantForAccessibility: hidden ? 'no-hide-descendants' : 'auto',
  };
}
