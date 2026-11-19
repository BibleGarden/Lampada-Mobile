import React, { createContext, forwardRef, useContext, useMemo } from 'react';
import { StyleSheet, View, type ViewProps, type StyleProp, type ViewStyle } from 'react-native';
import BottomSheet, {
  BottomSheetFooter, BottomSheetScrollView, useBottomSheetInternal,
  type BottomSheetFooterProps, type BottomSheetProps,
} from '@gorhom/bottom-sheet';
import Animated, { useAnimatedReaction, useAnimatedStyle, useDerivedValue, useSharedValue, type SharedValue } from 'react-native-reanimated';
import { State, TextInput as GestureTextInput } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { screenReaderHiddenProps } from '../../lib/a11y';
import { bottomActionPadding, sc, column, screenGutter, useStyles } from '../../lib/theme';
import { sheetBodyHeight, sheetFooterPosition } from '../../lib/keyboardGeometry';
import { useKeyboardFrames, useKeyboardLayout } from '../../lib/useKeyboardLayout';
import { useSheetReflow } from '../../lib/useSheetReflow';

type SheetContext = {
  footer: React.ReactNode;
  hidden: boolean;
  footerStyle?: StyleProp<ViewStyle>;
  footerBackground: ViewStyle;
  bodyHeight: SharedValue<number>;
  keyboardSnapPosition?: number;
  keyboardRestFraction?: number;
};
const SheetLayoutContext = createContext<SheetContext | null>(null);

function useSheetLayout() {
  const context = useContext(SheetLayoutContext);
  if (!context) throw new Error('KeyboardSheet is required for its content and footer');
  return context;
}

// Gorhom computes the footer position from its constant measured height
// (the inset above the safe area is measured once). The rise over the keyboard
// is subtracted from that same position on the UI thread, frame for frame with
// its animation: Gorhom moves the whole footer container, and the buttons stay
// within its bounds — where they are drawn is where Android accessibility
// (TalkBack, Maestro) finds them.
// The body ends above the footer and never compresses below the minimum
// (sheetFooterPosition). Only the footer moves frame for frame
// (transformation). The body height changes once at the start of a sheet or
// keyboard transition — straight to the target (sheetBodyHeight), so the footer
// is painted in the sheet's background and hides the part of the body it has
// not yet uncovered.
function SheetFooter({ animatedFooterPosition }: BottomSheetFooterProps) {
  const { footer, hidden, footerStyle, footerBackground, bodyHeight, keyboardSnapPosition, keyboardRestFraction } = useSheetLayout();
  const keyboard = useKeyboardFrames();
  const { animatedLayoutState, animatedAnimationState, animatedPosition, animatedHandleGestureState, animatedContentGestureState } = useBottomSheetInternal();
  const safeBottom = useSafeAreaInsets().bottom;
  const minBody = sc(72);
  const position = useDerivedValue(
    () => sheetFooterPosition(animatedFooterPosition.value, keyboard.reserved.value, safeBottom, minBody),
    [safeBottom, minBody],
  );
  useAnimatedReaction(() => {
    const gestures = [animatedHandleGestureState.get(), animatedContentGestureState.get()];
    const { nextIndex, nextPosition } = animatedAnimationState.get();
    return sheetBodyHeight(animatedLayoutState.get(), {
      position: animatedPosition.get(),
      nextIndex,
      nextPosition,
      dragging: gestures.some((state) => state === State.BEGAN || state === State.ACTIVE),
    }, keyboard.target.value, safeBottom, minBody, keyboardSnapPosition, keyboard.reserved.value, keyboardRestFraction);
  }, (height) => {
    if (height !== null && height !== bodyHeight.value) bodyHeight.value = height;
  }, [safeBottom, minBody, keyboardSnapPosition, keyboardRestFraction]);
  const styles = useStyles(stylesFactory);
  return (
    <BottomSheetFooter animatedFooterPosition={position} bottomInset={0} style={footerBackground}>
      <View
        {...screenReaderHiddenProps(hidden)}
        pointerEvents={hidden ? 'none' : 'auto'}
        style={[styles.footer, { paddingBottom: bottomActionPadding(safeBottom) }, footerStyle, hidden && styles.hidden]}
      >{footer}</View>
    </BottomSheetFooter>
  );
}

// The footer background is the sheet's background inside its side borders.
function footerBackgroundOf(backgroundStyle: BottomSheetProps['backgroundStyle']): ViewStyle {
  const { backgroundColor, borderWidth = 0 } = StyleSheet.flatten(backgroundStyle) ?? {};
  if (!backgroundColor) throw new Error('KeyboardSheet requires backgroundStyle.backgroundColor: the footer covers the body with it');
  return { backgroundColor, left: borderWidth, right: borderWidth };
}

type Props = Omit<BottomSheetProps, 'footerComponent' | 'bottomInset' | 'animatedPosition' | 'android_keyboardInputMode' | 'keyboardBehavior' | 'keyboardBlurBehavior'> & {
  footer: React.ReactNode;
  footerHidden: boolean;
  footerStyle?: StyleProp<ViewStyle>;
  accessibilityModal?: boolean;
  keyboardSnapPosition?: number;
  keyboardRestFraction?: number;
};

// KeyboardSheet and its background span the window's full width, including the
// tablet's two answer columns. Only the plain BottomSheet has a width cap.
// The footer reserves the keyboard and safe area; the container is independent of them.
const KeyboardSheet = forwardRef<BottomSheet, Props>(({ footer, footerHidden, footerStyle, keyboardSnapPosition, keyboardRestFraction, accessibilityModal = false, onAccessibilityEscape, onChange, onAnimate, children, ...props }, ref) => {
  const bodyHeight = useSharedValue(0);
  const footerBackground = useMemo(() => footerBackgroundOf(props.backgroundStyle), [props.backgroundStyle]);
  // Gorhom 5.2.14 does not re-layout a closed or closing sheet when the
  // container changes, and the container changes only together with the window.
  // So KeyboardSheet is the sole owner of the remount: a closed sheet is
  // recreated when the window changes, and one rotated while open — right after
  // closing (useSheetReflow). The sheet counts as open from the start of the
  // opening animation.
  const { mountKey, open: present, onIndexChange } = useSheetReflow();
  // The buttons ride with the sheet from the start of the opening animation
  // instead of appearing once it settles (on an iPad with a keyboard that is 1–2 seconds).
  const hidden = footerHidden || !present;
  const context = useMemo(
    () => ({ footer, hidden, footerStyle, footerBackground, bodyHeight, keyboardSnapPosition, keyboardRestFraction }),
    [footer, hidden, footerStyle, footerBackground, bodyHeight, keyboardSnapPosition, keyboardRestFraction],
  );
  return (
    <View
      style={[StyleSheet.absoluteFill, !present && styles.hidden]}
      pointerEvents={present ? 'box-none' : 'none'}
      accessibilityViewIsModal={accessibilityModal}
      onAccessibilityEscape={onAccessibilityEscape}
    >
      <SheetLayoutContext.Provider value={context}>
        <BottomSheet
          {...props}
          key={mountKey}
          ref={ref}
          bottomInset={0}
          android_keyboardInputMode="adjustResize"
          footerComponent={SheetFooter}
          onAnimate={(from, to, ...positions) => {
            if (to >= 0) onIndexChange(to);
            onAnimate?.(from, to, ...positions);
          }}
          onChange={(index, ...details) => {
            onIndexChange(index);
            onChange?.(index, ...details);
          }}
        >
          {children}
        </BottomSheet>
      </SheetLayoutContext.Provider>
    </View>
  );
});
KeyboardSheet.displayName = 'KeyboardSheet';
export default KeyboardSheet;

// A plain gesture-handler input is deliberately not registered with Gorhom's
// keyboard machinery: the footer already reserves the space above the keyboard.
// This rules out a second inset, including for the iPad's non-zero floating rectangle.
export const KeyboardSheetTextInput = forwardRef<GestureTextInput, React.ComponentProps<typeof GestureTextInput>>(({ style, ...props }, ref) => {
  useSheetLayout();
  const keyboard = useKeyboardLayout();
  const styles = useStyles(stylesFactory);
  return <GestureTextInput {...props} ref={ref} style={[style, keyboard.kind === 'floating' && styles.compactInput]} />;
});
KeyboardSheetTextInput.displayName = 'KeyboardSheetTextInput';

// Only the sheet sets the body size: an outside style (e.g. flex: 1) would
// override the height above the footer, and the body's bottom would slip under
// the buttons.
export function KeyboardSheetBody({ children, scrollable = true, ...props }: Omit<ViewProps, 'style'> & { scrollable?: boolean }) {
  const { bodyHeight } = useSheetLayout();
  const size = useAnimatedStyle(() => ({ height: bodyHeight.value }));
  return (
    <Animated.View {...props} style={[styles.body, size]}>
      {scrollable ? <BottomSheetScrollView
        style={styles.fill}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        nestedScrollEnabled
      >{children}</BottomSheetScrollView> : children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({ body: { width: '100%' }, fill: { flex: 1 }, scrollContent: { flexGrow: 1 }, hidden: { opacity: 0 } });
const stylesFactory = () => StyleSheet.create({
  footer: { ...column(), paddingHorizontal: screenGutter(), paddingTop: sc(10) },
  hidden: { opacity: 0 },
  compactInput: { flex: 0, height: sc(128) },
});
