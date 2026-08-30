import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn } from 'react-native-reanimated';
import Constants from 'expo-constants';
import * as Linking from 'expo-linking';
import { ExternalLink } from 'lucide-react-native';
import ScreenBg from '../components/ScreenBg';
import { IconButton, Kicker } from '../components/ui';
import { Book, ChevronLeft, Shield } from '../components/icons';
import { colors, column, fonts, radius, sc, useStyles } from '../lib/theme';

const BIBLE_GARDEN_URL = 'https://bible.garden';
const appVersion = Constants.expoConfig?.version ?? '—';

export default function About() {
  const styles = useStyles(stylesFactory);
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.root}>
      <ScreenBg />
      <Animated.View entering={FadeIn.duration(500)} style={styles.screen}>
        <View style={[styles.top, { paddingTop: insets.top + sc(10) }]}>
          <IconButton onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}>
            <ChevronLeft color={colors.goldSoft} />
          </IconButton>
          <Kicker>О приложении</Kicker>
          <View style={styles.topSpacer} />
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{
            paddingTop: sc(26),
            paddingHorizontal: sc(12),
            paddingBottom: insets.bottom + sc(28),
          }}
        >
          <Kicker style={styles.sectionKicker}>Назначение</Kicker>
          <View style={[styles.card, styles.purposeCard]}>
            <Text style={styles.lead}>Пространство для личной молитвы</Text>
            <Text style={styles.body}>
              Вы сами задаёте тему молитвы, а приложение помогает молиться целенаправленно и не
              терять фокус: задаёт наводящие вопросы и с помощью ИИ подбирает отрывки Писания по
              смыслу, а не по ключевым словам. Ответы можно сохранить и позже вернуться к ним в
              дневнике.
            </Text>
          </View>

          <Kicker style={[styles.sectionKicker, styles.sectionGap]}>Конфиденциальность</Kicker>
          <View style={styles.card}>
            <View style={styles.infoHeader}>
              <View style={styles.iconCircle}>
                <Shield size={17} color={colors.amberBright} />
              </View>
              <Text style={[styles.cardTitle, styles.infoTitle]}>Как используются ваши данные</Text>
            </View>
            <Text style={[styles.body, styles.infoBody]}>
              Ответы и голосовые записи хранятся на устройстве. Если включена передача ответов,
              их текст отправляется провайдеру ИИ для подбора вопросов и Писания, но не
              сохраняется на сервере приложения. Аудиозапись отправляется только в случае
              нажатия «Расшифровать» и тоже не сохраняется на сервере.
            </Text>
          </View>

          <Kicker style={[styles.sectionKicker, styles.sectionGap]}>Другое приложение</Kicker>
          <Pressable
            accessibilityRole="link"
            accessibilityLabel="Открыть сайт Bible Garden"
            testID="bible-garden-link"
            onPress={() => void Linking.openURL(BIBLE_GARDEN_URL)}
            style={({ pressed }) => [styles.card, pressed && styles.pressed]}
          >
            <View style={styles.projectHeader}>
              <View style={styles.iconCircle}>
                <Book size={17} color={colors.amberBright} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.cardTitle, styles.projectTitle]}>Bible Garden</Text>
                <Text style={styles.linkLabel}>bible.garden</Text>
              </View>
              <ExternalLink size={sc(16)} color={colors.labelGold} strokeWidth={1.7} />
            </View>
            <Text style={[styles.body, styles.projectBody]}>
              Слушайте Библию стих за стихом в нескольких выбранных переводах и языках: каждый
              стих последовательно звучит в каждом варианте.
            </Text>
          </Pressable>

          <Text style={styles.version}>Версия {appVersion}</Text>
        </ScrollView>
      </Animated.View>
    </View>
  );
}

const stylesFactory = () => StyleSheet.create({
  root: { flex: 1, backgroundColor: '#080604' },
  screen: { flex: 1, ...column() },
  top: {
    paddingHorizontal: sc(12),
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  topSpacer: { width: sc(34), height: sc(34) },
  sectionKicker: { marginBottom: sc(8), marginLeft: sc(4) },
  sectionGap: { marginTop: sc(22) },
  card: {
    backgroundColor: colors.cardBg,
    borderWidth: 1,
    borderColor: 'rgba(214,182,120,.22)',
    borderRadius: radius.md,
    padding: sc(14),
  },
  purposeCard: { paddingVertical: sc(18), gap: sc(8) },
  lead: {
    fontFamily: fonts.serifRegular,
    fontSize: sc(20),
    lineHeight: sc(25),
    color: colors.cream,
  },
  body: {
    fontFamily: fonts.sans,
    fontSize: sc(11),
    lineHeight: sc(16),
    color: colors.creamDim,
  },
  infoHeader: { flexDirection: 'row', alignItems: 'center', gap: sc(10) },
  infoTitle: { flex: 1, marginBottom: 0 },
  infoBody: { marginTop: sc(10) },
  projectHeader: { flexDirection: 'row', alignItems: 'center', gap: sc(10) },
  projectTitle: { marginBottom: 0 },
  projectBody: { marginTop: sc(10) },
  pressed: { opacity: 0.72, transform: [{ scale: 0.99 }] },
  iconCircle: {
    width: sc(32),
    height: sc(32),
    borderRadius: sc(16),
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(230,162,60,.11)',
    borderWidth: 1,
    borderColor: 'rgba(230,162,60,.2)',
  },
  cardTitle: {
    fontFamily: fonts.sansMedium,
    fontSize: sc(13.5),
    color: colors.parchment,
    marginBottom: sc(4),
  },
  linkLabel: {
    marginTop: sc(7),
    fontFamily: fonts.mono,
    fontSize: sc(9.5),
    color: colors.amberBright,
  },
  version: {
    marginTop: sc(26),
    textAlign: 'center',
    fontFamily: fonts.mono,
    fontSize: sc(9.5),
    color: colors.labelGoldDim,
  },
});
