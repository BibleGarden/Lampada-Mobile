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

// Позицию footer считает Gorhom по его постоянной измеренной высоте
// (отступ над безопасной зоной меряется один раз). Подъём над клавиатурой
// вычитается из этой же позиции на UI-потоке, кадр в кадр с её анимацией:
// Gorhom двигает контейнер footer целиком, и кнопки остаются в его границах —
// там, где они нарисованы, их находит доступность Android (TalkBack, Maestro).
// Тело кончается над footer и не сжимается ниже минимума (sheetFooterPosition).
// Кадр в кадр движется только footer (трансформация). Высота тела меняется
// один раз в начале перехода шторки или клавиатуры — сразу на целевую
// (sheetBodyHeight), поэтому footer закрашен фоном шторки и прячет часть тела,
// которую он ещё не открыл.
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

// Фон footer — фон шторки внутри её боковых рамок.
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

// Шторка и её фон занимают всё окно до края экрана. Клавиатуру и безопасную
// зону резервирует только footer, контейнер Gorhom от них не зависит.
const KeyboardSheet = forwardRef<BottomSheet, Props>(({ footer, footerHidden, footerStyle, keyboardSnapPosition, keyboardRestFraction, accessibilityModal = false, onAccessibilityEscape, onChange, onAnimate, children, ...props }, ref) => {
  const bodyHeight = useSharedValue(0);
  const footerBackground = useMemo(() => footerBackgroundOf(props.backgroundStyle), [props.backgroundStyle]);
  // Gorhom 5.2.14 не переставляет закрытую или закрывающуюся шторку при
  // смене контейнера, а контейнер меняется только вместе с окном. Поэтому
  // KeyboardSheet — единственный владелец пересборки: закрытую шторку
  // пересоздаём при смене окна, а повёрнутую открытой — сразу после закрытия
  // (useSheetReflow). Открытой шторка считается с начала анимации открытия.
  const { mountKey, open: present, onIndexChange } = useSheetReflow();
  // Кнопки едут вместе со шторкой с начала анимации открытия, а не появляются
  // после того, как она встанет (на iPad с клавиатурой это 1–2 секунды).
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

// Обычный gesture-handler input намеренно не регистрируется в механизме
// клавиатуры Gorhom: место над клавиатурой уже резервирует footer. Это исключает
// второй отступ, в том числе для ненулевого плавающего прямоугольника iPad.
export const KeyboardSheetTextInput = forwardRef<GestureTextInput, React.ComponentProps<typeof GestureTextInput>>(({ style, ...props }, ref) => {
  useSheetLayout();
  const keyboard = useKeyboardLayout();
  const styles = useStyles(stylesFactory);
  return <GestureTextInput {...props} ref={ref} style={[style, keyboard.kind === 'floating' && styles.compactInput]} />;
});
KeyboardSheetTextInput.displayName = 'KeyboardSheetTextInput';

// Размер тела задаёт только шторка: стиль снаружи (например, flex: 1)
// перебил бы высоту над footer, и низ тела ушёл бы под кнопки.
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
