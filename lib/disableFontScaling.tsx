// Disables scaling text to the system font size (iOS Dynamic Type, Android
// font scale) — see ADR 0032. Font sizes come from sc() tokens based on
// screen geometry, and the layout is designed for them; under system
// scaling (up to x2.35 on iOS) labels stop fitting and screens fall apart.
//
// React 19 dropped defaultProps on function components, so the default is
// installed by replacing the Text/TextInput getters on the react-native
// module exports: babel accesses imports as live module members, and every
// JSX <Text> call in the app and libraries goes through the getter. The
// originals are captured before the swap — otherwise the wrapper would
// render itself. An explicit allowFontScaling on a component wins.
//
// This module must be imported first in the root layout, before any screen
// renders.

import React from 'react';
import type { Text as TextType, TextInput as TextInputType } from 'react-native';

// Deliberately require: import * goes through interopRequireWildcard, which
// yields a copy of the exports, and the swap would never reach the module itself.
const ReactNative = require('react-native');
const NativeText: typeof TextType = ReactNative.Text;
const NativeTextInput: typeof TextInputType = ReactNative.TextInput;

type TextProps = React.ComponentProps<typeof NativeText>;
type TextInputProps = React.ComponentProps<typeof NativeTextInput>;
type TextRef = React.ElementRef<typeof NativeText>;
type TextInputRef = React.ElementRef<typeof NativeTextInput>;

const FixedText = React.forwardRef<TextRef, TextProps>(
  (props, ref) => <NativeText ref={ref} allowFontScaling={false} {...props} />,
);
FixedText.displayName = 'Text';

const FixedTextInput = React.forwardRef<TextInputRef, TextInputProps>(
  (props, ref) => <NativeTextInput ref={ref} allowFontScaling={false} {...props} />,
);
FixedTextInput.displayName = 'TextInput';
// TextInput.State statics are needed by navigation (expo-router's
// useKeyboardManager reads currentlyFocusedInput when a screen closes);
// without them it crashes.
Object.assign(FixedTextInput, { State: NativeTextInput.State });

Object.defineProperty(ReactNative, 'Text', { configurable: true, get: () => FixedText });
Object.defineProperty(ReactNative, 'TextInput', { configurable: true, get: () => FixedTextInput });
