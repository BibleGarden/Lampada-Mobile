import { useI18n } from '../lib/i18n';
import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn } from 'react-native-reanimated';
import ScreenBg from '../components/ScreenBg';
import ScripturePassageText from '../components/ScripturePassageText';
import { IconButton, Kicker } from '../components/ui';
import { ChevronLeft } from '../components/icons';
import { getFavoriteScriptures } from '../lib/scriptureRepository';
import { errorKind, recordDiagnostic } from '../lib/db';
import {
  buildScriptureCompactText,
  favoriteToScriptureDisplay,
  type FavoriteScripture,
} from '../lib/scripture';
import { colors, column, fonts, radius, sc, screenGutter, useStyles } from '../lib/theme';
import { withoutPunctuationAtClippedLine } from '../lib/textTruncation';

/**
 * Сколько строк отрывка показывать в свёрнутой карточке. В доке лимит считается
 * по свободной высоте экрана, здесь список прокручивается — поэтому фиксируем.
 */
const COLLAPSED_LINES = 4;

function FavoriteCard({ favorite }: { favorite: FavoriteScripture }) {
  const { t } = useI18n();
  const styles = useStyles(stylesFactory);
  const [expanded, setExpanded] = useState(false);
  const [lines, setLines] = useState(0);
  const [collapsedOverride, setCollapsedOverride] = useState<string | null>(null);

  // Ответ сервера сохранён вместе с записью, поэтому карточку рисует тот же
  // компонент, что и во время молитвы: свёрнутая — только ключевые стихи,
  // развёрнутая — весь отрывок с их подсветкой.
  const display = favoriteToScriptureDisplay(favorite);
  const compact = display ? buildScriptureCompactText(display) : null;
  const collapsedText = compact?.text ?? favorite.text;
  const canExpand = !!compact?.partial || lines > COLLAPSED_LINES;

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.reference}>{favorite.reference}</Text>
        {favorite.canonicalId === null ? <Text style={styles.legacy}>{t('screens.favorites.legacy')}</Text> : null}
      </View>
      {favorite.title ? <Text style={styles.title}>{favorite.title}</Text> : null}
      {collapsedText ? (
        <View>
          {display ? (
            <ScripturePassageText
              scripture={display}
              style={styles.text}
              numberOfLines={expanded ? undefined : COLLAPSED_LINES}
              compactTextOverride={expanded ? undefined : collapsedOverride ?? undefined}
              testIDPrefix={`favorite-highlight-${favorite.id}`}
              variant={expanded ? 'full' : 'compact'}
            />
          ) : (
            <Text style={styles.text} numberOfLines={expanded ? undefined : COLLAPSED_LINES}>
              {expanded ? favorite.text : collapsedOverride ?? favorite.text}
            </Text>
          )}
          {/* Невидимая копия свёрнутого текста: по ней считаем реальное число
              строк, иначе «Читать целиком» появлялось бы и там, где всё видно */}
          <Text
            accessible={false}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            pointerEvents="none"
            style={[styles.text, styles.measure]}
            onTextLayout={({ nativeEvent }) => {
              const measured = nativeEvent.lines;
              setLines((current) => current === measured.length ? current : measured.length);
              const next = measured.length > COLLAPSED_LINES
                ? withoutPunctuationAtClippedLine(collapsedText, measured[COLLAPSED_LINES - 1].text)
                : collapsedText;
              setCollapsedOverride((current) => {
                const corrected = next === collapsedText ? null : next;
                return current === corrected ? current : corrected;
              });
            }}
          >
            {collapsedText}
          </Text>
        </View>
      ) : null}
      {canExpand ? (
        <Pressable
          onPress={() => setExpanded((value) => !value)}
          accessibilityRole="button"
          testID={`favorite-toggle-${favorite.id}`}
          style={({ pressed }) => [styles.readMore, pressed && { opacity: 0.7 }]}
        >
          <Text style={styles.readMoreLabel}>{expanded ? t('screens.favorites.collapse') : t('screens.favorites.read')}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export default function Favorites() {
  const { t } = useI18n();
  const styles = useStyles(stylesFactory);
  const insets = useSafeAreaInsets();
  const [favorites, setFavorites] = useState<FavoriteScripture[]>([]);
  const [loadFailed, setLoadFailed] = useState(false);

  const load = useCallback(() => {
    void getFavoriteScriptures().then(
      (next) => {
        setFavorites(next);
        setLoadFailed(false);
      },
      (error: unknown) => {
        console.error('Failed to read saved passages', errorKind(error));
        recordDiagnostic('favorites_load_failed', { errorKind: errorKind(error) });
        // Пустой список выглядел бы как «ничего не сохранено».
        setFavorites([]);
        setLoadFailed(true);
      },
    );
  }, []);
  useEffect(load, [load]);
  useFocusEffect(load);

  return (
    <View style={styles.root}>
      <ScreenBg />
      <Animated.View entering={FadeIn.duration(400)} style={styles.screen}>
        <View style={[styles.top, { paddingTop: insets.top + sc(10) }]}>
          <IconButton
            accessibilityLabel={t('settings.back')}
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          >
            <ChevronLeft color={colors.goldSoft} />
          </IconButton>
          <Kicker>{t('screens.favorites.title')}</Kicker>
          <View style={{ width: sc(34) }} />
        </View>
        <ScrollView
          contentContainerStyle={{
            paddingTop: sc(14),
            paddingHorizontal: screenGutter(),
            paddingBottom: insets.bottom + sc(28),
            gap: sc(12),
          }}
        >
          {loadFailed ? (
            <Pressable accessibilityRole="button" onPress={load} testID="favorites-load-error">
              <Text style={styles.empty}>{t('screens.favorites.loadFailed')}</Text>
            </Pressable>
          ) : favorites.length === 0 ? (
            <Text style={styles.empty}>{t('screens.favorites.empty')}</Text>
          ) : favorites.map((favorite) => (
            <FavoriteCard key={favorite.id} favorite={favorite} />
          ))}
        </ScrollView>
      </Animated.View>
    </View>
  );
}

const stylesFactory = () => StyleSheet.create({
  root: { flex: 1, backgroundColor: '#080604' },
  screen: { flex: 1, ...column() },
  top: {
    paddingHorizontal: screenGutter(), paddingBottom: sc(8),
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  empty: {
    marginTop: sc(32), fontFamily: fonts.serif, fontSize: sc(17),
    textAlign: 'center', color: colors.warmHint,
  },
  card: {
    padding: sc(15), borderRadius: radius.md, backgroundColor: colors.cardBg,
    borderWidth: 1, borderColor: 'rgba(214,182,120,.22)',
  },
  cardHeader: { gap: sc(5), marginBottom: sc(10) },
  reference: {
    fontFamily: fonts.mono, fontSize: sc(10), lineHeight: sc(15),
    letterSpacing: sc(1.1), textTransform: 'uppercase', color: colors.labelGold,
  },
  legacy: {
    alignSelf: 'flex-start', fontFamily: fonts.sansMedium, fontSize: sc(9),
    color: colors.warmHint,
  },
  title: {
    marginBottom: sc(8), fontFamily: fonts.sansMedium, fontSize: sc(14),
    color: colors.goldSoft,
  },
  text: {
    fontFamily: fonts.serif, fontSize: sc(15), lineHeight: sc(24), color: colors.cardText,
  },
  measure: {
    position: 'absolute', top: 0, left: 0, right: 0, opacity: 0,
  },
  readMore: {
    marginTop: sc(10), flexDirection: 'row', alignItems: 'center', gap: sc(5),
  },
  readMoreLabel: {
    fontFamily: fonts.sansMedium, fontSize: sc(12), color: colors.goldSoft,
  },
});
