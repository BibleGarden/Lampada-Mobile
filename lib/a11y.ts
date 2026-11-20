import type { ViewProps } from 'react-native';

// Hides content from screen readers while an overlay or a sheet is on top,
// including a closed sheet that has slid below the bottom edge.
//
// `accessibilityViewIsModal` on the overlay is not a substitute here:
// VoiceOver only excludes siblings of the modal node, while
// `@gorhom/bottom-sheet` sheets render as siblings of the screen through a
// fragment, so the flag on their content never reaches the screen. TalkBack
// does not know this flag at all. A closed sheet is only shifted by a
// transform and, without a marker, stays in the traversal order. Therefore
// the marker goes on the hidden subtree itself, on both platforms.

/**
 * Props for a container that must be hidden from VoiceOver and TalkBack
 * while `hidden`.
 *
 * `collapsable: false` is set permanently, not only under an overlay:
 * Fabric collapses a wrapper view with no props of its own, leaving no node
 * in the native tree to carry the marker. The permanent flag also prevents
 * re-creating the native subtree each time the overlay is enabled —
 * otherwise screens under a sheet would lose scroll position and restart
 * animations.
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
