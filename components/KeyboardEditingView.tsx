import React, { useEffect, useState } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  LayoutAnimation,
  Platform,
  Pressable,
  ScrollView,
  View,
  type KeyboardEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

type Props = {
  children: (editing: boolean) => React.ReactNode;
  contentStyle: StyleProp<ViewStyle>;
  editingContentStyle?: StyleProp<ViewStyle>;
  topPadding: number;
  bottomPadding: number;
  editingBottomPadding: number;
};

function animateKeyboardLayout(event: KeyboardEvent) {
  const duration = Math.max(event.duration ?? 0, 380);
  LayoutAnimation.configureNext({
    duration,
    update: { duration, type: LayoutAnimation.Types.keyboard },
  });
}

export default function KeyboardEditingView({
  children,
  contentStyle,
  editingContentStyle,
  topPadding,
  bottomPadding,
  editingBottomPadding,
}: Props) {
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvent, (event) => {
      animateKeyboardLayout(event);
      setEditing(true);
    });
    const hide = Keyboard.addListener(hideEvent, (event) => {
      animateKeyboardLayout(event);
      setEditing(false);
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <ScrollView
        contentContainerStyle={{ flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <Pressable onPress={Keyboard.dismiss} accessible={false} style={{ flexGrow: 1 }}>
          <View
            style={[
              contentStyle,
              editing && editingContentStyle,
              { paddingTop: topPadding, paddingBottom: editing ? editingBottomPadding : bottomPadding },
            ]}
          >
            {children(editing)}
          </View>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
