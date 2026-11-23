import React, { useEffect, useMemo, useState } from 'react';
import { Dimensions, Keyboard, Platform, type KeyboardEvent } from 'react-native';
import { useDerivedValue, useSharedValue } from 'react-native-reanimated';
import { KeyboardProvider, useKeyboardHandler, useReanimatedKeyboardAnimation } from 'react-native-keyboard-controller';
import {
  hiddenKeyboard, keyboardLayoutFor, reservedKeyboardHeight, updateKeyboardState,
  type KeyboardLayout, type KeyboardState,
} from '../../lib/keyboardGeometry';
import { KeyboardFramesContext, KeyboardLayoutContext } from '../../lib/useKeyboardLayout';

// Keyboard reserve: the state comes from React Native's classifier, animation
// frames from Keyboard Controller (reservedKeyboardHeight). The target is the
// reserve the current animation is heading to: Keyboard Controller reports the
// destination height at its start.
function KeyboardReservation({ kind, children }: React.PropsWithChildren<{ kind: KeyboardLayout['kind'] }>) {
  const { height } = useReanimatedKeyboardAnimation();
  const moving = useSharedValue(false);
  const destination = useSharedValue(Keyboard.metrics()?.height ?? 0);
  useKeyboardHandler({
    onStart: (event) => { 'worklet'; moving.value = true; destination.value = event.height; },
    onEnd: (event) => { 'worklet'; moving.value = false; destination.value = event.height; },
  }, []);
  // height in Keyboard Controller is negative: it is an upward shift.
  const reserved = useDerivedValue(() => reservedKeyboardHeight(kind, moving.value, -height.value), [kind]);
  const target = useDerivedValue(() => reservedKeyboardHeight(kind, moving.value, destination.value), [kind]);
  const frames = useMemo(() => ({ reserved, target }), [reserved, target]);
  return <KeyboardFramesContext.Provider value={frames}>{children}</KeyboardFramesContext.Provider>;
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

  // On iPad the floating panel can be wider than the Stage Manager window, but
  // it is still narrower than the current display's docked system keyboard.
  // Android does not compare widths (keyboardLayoutFor).
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
