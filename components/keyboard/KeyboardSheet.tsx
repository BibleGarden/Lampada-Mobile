import React, { createContext, forwardRef, useContext, useMemo } from 'react';
import { StyleSheet, type ViewProps, type StyleProp, type ViewStyle } from 'react-native';
import BottomSheet, { BottomSheetFooter, BottomSheetScrollView, type BottomSheetFooterProps, type BottomSheetProps } from '@gorhom/bottom-sheet';
import Animated, { useAnimatedReaction, useAnimatedStyle, useSharedValue, type SharedValue } from 'react-native-reanimated';
import { TextInput as GestureTextInput } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { screenReaderHiddenProps } from '../../lib/a11y';
import { sc, column, useStyles } from '../../lib/theme';
import KeyboardViewport, { useReservedKeyboardHeight } from './KeyboardViewport';
import { useKeyboardLayout } from '../../lib/useKeyboardLayout';
import { useSheetReflow } from '../../lib/useSheetReflow';

type SheetContext = { footer: React.ReactNode; hidden: boolean; footerStyle?: StyleProp<ViewStyle>; bodyHeight: SharedValue<number> };
const SheetLayoutContext = createContext<SheetContext | null>(null);

function useSheetLayout() {
  const context = useContext(SheetLayoutContext);
  if (!context) throw new Error('KeyboardSheet is required for its content and footer');
  return context;
}

// Позицию низа тела сообщает сам Gorhom после учёта контейнера, ручки
// и измеренного footer. Контейнер шторки — всё окно, поэтому footer сам
// резервирует снизу max(безопасная зона, клавиатура) кадр в кадр с анимацией
// клавиатуры, а тело кончается над ним.
function SheetFooter({ animatedFooterPosition }: BottomSheetFooterProps) {
  const { footer, hidden, footerStyle, bodyHeight } = useSheetLayout();
  useAnimatedReaction(() => animatedFooterPosition.value, (height) => { bodyHeight.value = Math.max(0, height); });
  const keyboard = useReservedKeyboardHeight(true);
  const safeBottom = useSafeAreaInsets().bottom;
  const gap = sc(16);
  const inset = useAnimatedStyle(() => ({ paddingBottom: gap + Math.max(safeBottom, keyboard.value) }), [gap, safeBottom]);
  const styles = useStyles(stylesFactory);
  return (
    <BottomSheetFooter animatedFooterPosition={animatedFooterPosition} bottomInset={0}>
      <Animated.View
        {...screenReaderHiddenProps(hidden)}
        pointerEvents={hidden ? 'none' : 'auto'}
        style={[styles.footer, footerStyle, inset, hidden && styles.hidden]}
      >{footer}</Animated.View>
    </BottomSheetFooter>
  );
}

type Props = Omit<BottomSheetProps, 'footerComponent' | 'bottomInset' | 'animatedPosition' | 'android_keyboardInputMode' | 'keyboardBehavior' | 'keyboardBlurBehavior'> & {
  footer: React.ReactNode;
  footerHidden: boolean;
  footerStyle?: StyleProp<ViewStyle>;
  accessibilityModal?: boolean;
};

// Клавиатуру резервирует только footer, контейнер Gorhom от неё не зависит.
// Gorhom владеет только положением шторки и footer внутри окна.
const KeyboardSheet = forwardRef<BottomSheet, Props>(({ footer, footerHidden, footerStyle, accessibilityModal = false, onAccessibilityEscape, onChange, onAnimate, children, ...props }, ref) => {
  const bodyHeight = useSharedValue(0);
  // Gorhom 5.2.14 не переставляет закрытую или закрывающуюся шторку при
  // смене контейнера, а контейнер меняется только вместе с окном. Поэтому
  // KeyboardSheet — единственный владелец пересборки: закрытую шторку
  // пересоздаём при смене окна, а повёрнутую открытой — сразу после закрытия
  // (useSheetReflow). Открытой шторка считается с начала анимации открытия.
  const { mountKey, open: present, onIndexChange } = useSheetReflow();
  const context = useMemo(() => ({ footer, hidden: footerHidden, footerStyle, bodyHeight }), [footer, footerHidden, footerStyle, bodyHeight]);
  return (
    <KeyboardViewport
      overlay
      style={!present && styles.hidden}
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
    </KeyboardViewport>
  );
});
KeyboardSheet.displayName = 'KeyboardSheet';
export default KeyboardSheet;

// Обычный gesture-handler input намеренно не регистрируется в механизме
// клавиатуры Gorhom: место уже резервирует KeyboardViewport. Это исключает
// второй отступ, в том числе для ненулевого плавающего прямоугольника iPad.
export const KeyboardSheetTextInput = forwardRef<GestureTextInput, React.ComponentProps<typeof GestureTextInput>>(({ style, ...props }, ref) => {
  useSheetLayout();
  const keyboard = useKeyboardLayout();
  const styles = useStyles(stylesFactory);
  return <GestureTextInput {...props} ref={ref} style={[style, keyboard.kind === 'floating' && styles.compactInput]} />;
});
KeyboardSheetTextInput.displayName = 'KeyboardSheetTextInput';

export function KeyboardSheetBody({ children, style, scrollable = true, ...props }: ViewProps & { scrollable?: boolean }) {
  const { bodyHeight } = useSheetLayout();
  const size = useAnimatedStyle(() => ({ height: bodyHeight.value }));
  return (
    <Animated.View {...props} style={[styles.body, style, size]}>
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
  footer: { ...column(), paddingHorizontal: sc(16), paddingTop: sc(10) },
  hidden: { opacity: 0 },
  compactInput: { flex: 0, height: sc(128) },
});
