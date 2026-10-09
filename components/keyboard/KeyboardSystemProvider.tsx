import React, { useEffect, useMemo, useState } from 'react';
import { Dimensions, Keyboard, Platform, useWindowDimensions, type KeyboardEvent } from 'react-native';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { hiddenKeyboard, keyboardLayoutFor, updateKeyboardState, type KeyboardState } from '../../lib/keyboardGeometry';
import { KeyboardLayoutContext } from '../../lib/useKeyboardLayout';

export default function KeyboardSystemProvider({ children }: React.PropsWithChildren) {
  const { width } = useWindowDimensions();
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
  const dockedWidth = Platform.OS === 'ios' ? Dimensions.get('screen').width : width;
  const layout = useMemo(() => keyboardLayoutFor(state, dockedWidth), [state, dockedWidth]);
  return (
    <KeyboardProvider preload={false} statusBarTranslucent navigationBarTranslucent>
      <KeyboardLayoutContext.Provider value={layout}>{children}</KeyboardLayoutContext.Provider>
    </KeyboardProvider>
  );
}
