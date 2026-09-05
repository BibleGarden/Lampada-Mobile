import { useI18n } from '../lib/i18n';
import React, { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn } from 'react-native-reanimated';
import Constants from 'expo-constants';
import * as Linking from 'expo-linking';
import { Code, ExternalLink, Globe, Mail, Send } from 'lucide-react-native';
import { fetchAboutContacts, type AboutContact } from '../lib/aboutClient';
import ScreenBg from '../components/ScreenBg';
import { IconButton, Kicker } from '../components/ui';
import { Book, ChevronLeft } from '../components/icons';
import { colors, column, fonts, radius, sc, useStyles } from '../lib/theme';

const BIBLE_GARDEN_URL = 'https://bible.garden';
const appVersion = Constants.expoConfig?.version ?? '—';

export default function About() {
  const { t, language } = useI18n();
  const styles = useStyles(stylesFactory);
  const insets = useSafeAreaInsets();
  const [contacts, setContacts] = useState<AboutContact[]>([]);
  const [contactsStatus, setContactsStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setContactsStatus('loading');
    fetchAboutContacts(controller.signal, language).then((items) => {
      if (controller.signal.aborted) return;
      setContacts(items);
      setContactsStatus('ready');
    }).catch(() => {
      if (!controller.signal.aborted) setContactsStatus('error');
    });
    return () => controller.abort();
  }, [attempt, language]);

  return (
    <View style={styles.root}>
      <ScreenBg />
      <Animated.View entering={FadeIn.duration(500)} style={styles.screen}>
        <View style={[styles.top, { paddingTop: insets.top + sc(10) }]}>
          <IconButton onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}>
            <ChevronLeft color={colors.goldSoft} />
          </IconButton>
          <Kicker>{t('screens.about.title')}</Kicker>
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
          <Kicker style={styles.sectionKicker}>{t('screens.about.lampada')}</Kicker>
          <View style={[styles.card, styles.purposeCard]}>
            <Text style={styles.lead}>{t('screens.about.lead')}</Text>
            <Text style={styles.body}>
              {t('screens.about.description')}
            </Text>
            <Text style={styles.body}>
              {t('screens.about.journal')}
            </Text>
          </View>

          <Kicker style={[styles.sectionKicker, styles.sectionGap]}>{t('screens.about.contact')}</Kicker>
          {contactsStatus === 'loading' ? <Text style={styles.body}>{t('screens.about.loading')}</Text> : null}
          {contactsStatus === 'error' ? (
            <View style={styles.card}>
              <Text style={styles.body}>{t('screens.about.failed')}</Text>
              <Pressable accessibilityRole="button" onPress={() => setAttempt((value) => value + 1)} style={styles.retryButton}>
                <Text style={styles.cardTitle}>{t('screens.about.retry')}</Text>
              </Pressable>
            </View>
          ) : null}
          {contactsStatus === 'ready' && contacts.length === 0 ? <Text style={styles.body}>{t('screens.about.empty')}</Text> : null}
          {contactsStatus === 'ready' && contacts.length > 0 ? (
            <View style={[styles.card, styles.contactsCard]}>
              {contacts.map((contact, index) => {
            const ContactIcon = contact.icon.includes('paperplane') ? Send
              : contact.icon.includes('chevron') ? Code
              : contact.icon.includes('envelope') ? Mail : Globe;
            return (
              <Pressable
                key={contact.id}
                accessibilityRole="link"
                accessibilityLabel={`${contact.label}, ${contact.subtitle}`}
                testID={`contacts-${contact.id}`}
                onPress={() => void Linking.openURL(contact.url).catch(() => Alert.alert(t('screens.about.linkFailed'), t('screens.about.later')))}
                style={({ pressed }) => [styles.contactRow, index > 0 && styles.contactDivider, pressed && styles.contactPressed]}
              >
                <View style={styles.iconCircle}><ContactIcon size={17} color={colors.amberBright} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.cardTitle, styles.projectTitle]}>{contact.label}</Text>
                  <Text style={styles.contactSubtitle}>{contact.subtitle}</Text>
                </View>
                <ExternalLink size={sc(16)} color={colors.labelGold} strokeWidth={1.7} />
              </Pressable>
            );
              })}
            </View>
          ) : null}

          <Kicker style={[styles.sectionKicker, styles.sectionGap]}>{t('screens.about.other')}</Kicker>
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={t('screens.about.openBible')}
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
              {t('screens.about.bible')}
            </Text>
          </Pressable>

          <Text style={styles.version}>{t('screens.about.version', { version: appVersion })}</Text>
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
  projectHeader: { flexDirection: 'row', alignItems: 'center', gap: sc(10) },
  contactsCard: { paddingVertical: 0 },
  contactRow: { flexDirection: 'row', alignItems: 'center', gap: sc(10), paddingVertical: sc(8) },
  contactDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(214,182,120,.16)' },
  contactPressed: { opacity: 0.72 },
  contactSubtitle: { fontFamily: fonts.sans, fontSize: sc(11), color: colors.creamDim, marginTop: sc(1) },
  retryButton: { minHeight: sc(44), justifyContent: 'center', marginTop: sc(6) },
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
