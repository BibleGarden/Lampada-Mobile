import React, { useEffect, useRef, useState } from 'react';
import {
  BackHandler,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import ScreenBg from '../components/ScreenBg';
import { GoldButton, Kicker } from '../components/ui';
import { useSession } from '../lib/store';
import { colors, fonts, radius } from '../lib/theme';

export default function Reflect() {
  const insets = useSafeAreaInsets();
  const s = useSession();
  const [takeaway, setTakeaway] = useState('');
  const completing = useRef(false);

  // Android «назад» тут некуда вести — только явное завершение
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, []);

  const complete = async (saveText: string) => {
    if (completing.current) return; // двойной тап не должен завершать дважды
    completing.current = true;
    try {
      await s.complete(saveText);
      router.replace('/done');
    } catch (e) {
      completing.current = false;
      throw e;
    }
  };

  return (
    <View style={styles.root}>
      <ScreenBg />
      <Animated.View
        entering={FadeIn.duration(500)}
        style={[styles.body, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1, justifyContent: 'space-between' }}
        >
          <View>
            <Kicker>Молитва завершена</Kicker>
            <Text style={styles.title}>Побудь ещё мгновение в тишине</Text>
          </View>

          <Animated.View entering={FadeInDown.delay(200).duration(400)} style={styles.card}>
            <Text style={styles.question}>
              {s.reflectQ || 'Что из этой молитвы тебе хочется унести с собой?'}
            </Text>
            <TextInput
              value={takeaway}
              onChangeText={setTakeaway}
              multiline
              placeholder="Одна-две строки…"
              placeholderTextColor="rgba(240,230,210,.3)"
              style={styles.input}
            />
          </Animated.View>

          <View style={{ gap: 12 }}>
            <GoldButton label="Сохранить и завершить" onPress={() => complete(takeaway.trim())} />
            <Pressable onPress={() => complete('')} style={styles.skip}>
              <Text style={styles.skipLabel}>Пропустить</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0a0806' },
  body: { flex: 1, paddingHorizontal: 18 },
  title: {
    marginTop: 7,
    fontFamily: fonts.serif,
    fontSize: 22,
    lineHeight: 28,
    color: '#efe9da',
  },
  card: {
    padding: 14,
    borderRadius: radius.sm,
    backgroundColor: colors.cardBg,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  question: {
    fontFamily: fonts.serif,
    fontSize: 16,
    lineHeight: 23,
    color: colors.cardText,
    textAlign: 'center',
    marginBottom: 12,
  },
  input: {
    minHeight: 88,
    padding: 12,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(255,255,255,.045)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,.12)',
    color: '#f2e9d6',
    fontSize: 15,
    lineHeight: 23,
    fontFamily: fonts.serifRegular,
    textAlignVertical: 'top',
  },
  skip: {
    alignItems: 'center',
    paddingVertical: 6,
  },
  skipLabel: {
    fontFamily: fonts.sans,
    fontSize: 13,
    color: colors.white45,
  },
});
