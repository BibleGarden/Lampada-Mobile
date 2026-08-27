import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn } from 'react-native-reanimated';
import ScreenBg from '../components/ScreenBg';
import { IconButton, Kicker } from '../components/ui';
import { ChevronLeft } from '../components/icons';
import { getFavoriteScriptures } from '../lib/scriptureRepository';
import type { FavoriteScripture } from '../lib/scripture';
import { colors, fonts, radius, sc } from '../lib/theme';

export default function Favorites() {
  const insets = useSafeAreaInsets();
  const [favorites, setFavorites] = useState<FavoriteScripture[]>([]);

  const load = useCallback(() => {
    void getFavoriteScriptures().then(setFavorites);
  }, []);
  useEffect(load, [load]);
  useFocusEffect(load);

  return (
    <View style={styles.root}>
      <ScreenBg />
      <Animated.View entering={FadeIn.duration(400)} style={{ flex: 1 }}>
        <View style={[styles.top, { paddingTop: insets.top + sc(10) }]}>
          <IconButton onPress={() => (router.canGoBack() ? router.back() : router.replace('/settings'))}>
            <ChevronLeft color={colors.goldSoft} />
          </IconButton>
          <Kicker>Избранное Писание</Kicker>
          <View style={{ width: sc(34) }} />
        </View>
        <ScrollView
          contentContainerStyle={{
            paddingTop: sc(14),
            paddingHorizontal: sc(18),
            paddingBottom: insets.bottom + sc(28),
            gap: sc(12),
          }}
        >
          {favorites.length === 0 ? (
            <Text style={styles.empty}>Здесь появятся сохранённые отрывки.</Text>
          ) : favorites.map((favorite) => (
            <View key={favorite.id} style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.reference}>{favorite.reference}</Text>
                {favorite.canonicalId === null ? <Text style={styles.legacy}>Сохранено ранее</Text> : null}
              </View>
              {favorite.title ? <Text style={styles.title}>{favorite.title}</Text> : null}
              {favorite.text ? <Text style={styles.text}>{favorite.text}</Text> : null}
            </View>
          ))}
        </ScrollView>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#080604' },
  top: {
    paddingHorizontal: sc(12), paddingBottom: sc(8),
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
});
