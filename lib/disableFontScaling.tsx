// Запрет масштабирования текста под системный размер шрифта (iOS Dynamic
// Type, Android font scale) — см. ADR 0032. Кегль задан токенами sc() от
// геометрии экрана, вёрстка под него рассчитана; при системном увеличении
// (на iOS до ×2.35) надписи перестают помещаться и экраны «плывут».
//
// В React 19 defaultProps на функциональных компонентах не работают, поэтому
// дефолт ставится подменой геттеров Text/TextInput на module.exports
// react-native: babel обращается к импортам как к живым членам модуля, и
// каждый JSX-вызов <Text> в приложении и библиотеках проходит через геттер.
// Оригиналы сохраняются до подмены — иначе обёртка отрендерит саму себя.
// Явный allowFontScaling на компоненте имеет приоритет.
//
// Модуль должен подключаться первым в корневом layout, до рендера экранов.

import React from 'react';
import type { Text as TextType, TextInput as TextInputType } from 'react-native';

// Именно require: import * через interopRequireWildcard даёт копию экспортов,
// и подмена до самого модуля не дошла бы.
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
// Статика TextInput.State нужна навигации (useKeyboardManager в expo-router
// читает currentlyFocusedInput при закрытии экрана); без неё — падение.
Object.assign(FixedTextInput, { State: NativeTextInput.State });

Object.defineProperty(ReactNative, 'Text', { configurable: true, get: () => FixedText });
Object.defineProperty(ReactNative, 'TextInput', { configurable: true, get: () => FixedTextInput });
