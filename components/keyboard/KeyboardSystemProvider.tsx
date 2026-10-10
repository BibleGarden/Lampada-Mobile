import React, { useEffect, useMemo, useState } from 'react';
import { Dimensions, Keyboard, Platform, type KeyboardEvent } from 'react-native';
import { useDerivedValue, useSharedValue } from 'react-native-reanimated';
import { KeyboardProvider, useKeyboardHandler, useReanimatedKeyboardAnimation } from 'react-native-keyboard-controller';
import {
  hiddenKeyboard, keyboardLayoutFor, reservedKeyboardHeight, updateKeyboardState,
  type KeyboardLayout, type KeyboardState,
} from '../../lib/keyboardGeometry';
import { KeyboardLayoutContext, ReservedKeyboardHeightContext } from '../../lib/useKeyboardLayout';

// Резерв под клавиатуру: состояние даёт классификатор React Native, кадры
// анимации — Keyboard Controller (reservedKeyboardHeight).
function KeyboardReservation({ kind, children }: React.PropsWithChildren<{ kind: KeyboardLayout['kind'] }>) {
  const { height } = useReanimatedKeyboardAnimation();
  const moving = useSharedValue(false);
  useKeyboardHandler({
    onStart: () => { 'worklet'; moving.value = true; },
    onEnd: () => { 'worklet'; moving.value = false; },
  }, []);
  // height в Keyboard Controller отрицательна: это сдвиг вверх.
  const reserved = useDerivedValue(() => reservedKeyboardHeight(kind, moving.value, -height.value), [kind]);
  return <ReservedKeyboardHeightContext.Provider value={reserved}>{children}</ReservedKeyboardHeightContext.Provider>;
}

export default function KeyboardSystemProvider({ children }: React.PropsWithChildren) {
  const [state, setState] = useState<KeyboardState>(() => {
    const coordinates = Keyboard.metrics();
    return coordinates ? { coordinates, phase: 'open' } : hiddenKeyboard;
  });

  useEffect(() => {
    const show = (event: KeyboardEvent, settled: boolean) => {
      setState((current) => updateKeyboardState(current, { type: 'show', coordinates: event.endCoordinates, settled }));
    };
    const subscriptions = [
      Keyboard.addListener('keyboardDidShow', (event) => show(event, true)),
      Keyboard.addListener('keyboardDidHide', () => {
        setState((current) => updateKeyboardState(current, { type: 'hide' }));
      }),
      Keyboard.addListener('keyboardDidChangeFrame', (event) => {
        setState((current) => updateKeyboardState(current, { type: 'frame', coordinates: event.endCoordinates }));
      }),
    ];
    if (Platform.OS === 'ios') {
      subscriptions.push(
        Keyboard.addListener('keyboardWillShow', (event) => show(event, false)),
        Keyboard.addListener('keyboardWillHide', () => {
          setState((current) => updateKeyboardState(current, { type: 'willHide' }));
        }),
      );
    }
    return () => subscriptions.forEach((subscription) => subscription.remove());
  }, []);

  // На iPad плавающая панель может быть шире окна Stage Manager, но она
  // всё равно уже системной закреплённой клавиатуры текущего дисплея.
  // Android ширину не сравнивает (keyboardLayoutFor).
  const dockedWidth = Platform.OS === 'ios' ? Dimensions.get('screen').width : null;
  const layout = useMemo(() => keyboardLayoutFor(state, dockedWidth), [state, dockedWidth]);
  return (
    <KeyboardProvider preload={false} statusBarTranslucent navigationBarTranslucent>
      <KeyboardLayoutContext.Provider value={layout}>
        <KeyboardReservation kind={layout.kind}>{children}</KeyboardReservation>
      </KeyboardLayoutContext.Provider>
    </KeyboardProvider>
  );
}
