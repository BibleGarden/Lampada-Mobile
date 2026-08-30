import React, { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import ScreenBg from '../components/ScreenBg';
import { IconButton, Kicker } from '../components/ui';
import { Check, ChevronLeft, ChevronRight } from '../components/icons';
import { useSettings } from '../lib/settings';
import {
  fetchScriptureLanguages,
  fetchScriptureTranslations,
} from '../lib/scriptureCatalogClient';
import {
  preferencesFromCatalog,
  type ScriptureLanguageOption,
  type ScriptureTranslation,
  type ScriptureVoice,
} from '../lib/scripturePreferences';
import { colors, fonts, radius, sc, useStyles } from '../lib/theme';

type OpenPicker = 'language' | 'translation' | 'voice' | null;

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  const styles = useStyles(stylesFactory);
  return (
    <Pressable
      accessibilityLabel="Использовать ответы для цитат и вопросов"
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      testID="share-answers-toggle"
      onPress={() => {
        void Haptics.selectionAsync();
        onChange(!value);
      }}
      hitSlop={8}
      style={[styles.toggle, value && styles.toggleOn]}
    >
      <View style={[styles.knob, value && styles.knobOn]} />
    </Pressable>
  );
}

function PickerCard({
  id, label, value, open, disabled, children, onToggle,
}: {
  id: Exclude<OpenPicker, null>;
  label: string;
  value: string;
  open: boolean;
  disabled?: boolean;
  children: React.ReactNode;
  onToggle: (id: Exclude<OpenPicker, null>) => void;
}) {
  const styles = useStyles(stylesFactory);
  return (
    <View style={[styles.pickerCard, open && styles.pickerCardOpen, disabled && styles.disabled]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value}`}
        accessibilityState={{ expanded: open, disabled: !!disabled }}
        testID={`scripture-${id}-picker`}
        disabled={disabled}
        onPress={() => onToggle(id)}
        style={styles.pickerHeader}
      >
        <View style={[styles.pickerAccent, open && styles.pickerAccentOpen]} />
        <View style={styles.pickerHeading}>
          <Text style={styles.pickerLabel}>{label}</Text>
          <Text style={styles.pickerValue} numberOfLines={1}>{value}</Text>
        </View>
        <View style={styles.chevronCircle}>
          <View style={{ transform: [{ rotate: open ? '-90deg' : '90deg' }] }}>
            <ChevronRight size={16} color={colors.parchment} />
          </View>
        </View>
      </Pressable>
      {open ? <View style={styles.options}>{children}</View> : null}
    </View>
  );
}

function OptionRow({ title, subtitle, selected, divided, onPress, testID }: {
  title: string;
  subtitle?: string | null;
  selected: boolean;
  divided?: boolean;
  onPress: () => void;
  testID: string;
}) {
  const styles = useStyles(stylesFactory);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}
      testID={testID}
      onPress={onPress}
      style={({ pressed }) => [
        styles.optionRow,
        divided && styles.optionDivider,
        pressed && styles.optionPressed,
      ]}
    >
      <View style={{ flex: 1 }}>
        <Text style={[styles.optionTitle, selected && styles.optionSelected]}>{title}</Text>
        {subtitle ? <Text style={styles.optionSubtitle}>{subtitle}</Text> : null}
      </View>
      {selected ? <Check size={18} color={colors.amberBright} /> : null}
    </Pressable>
  );
}

export default function Settings() {
  const styles = useStyles(stylesFactory);
  const insets = useSafeAreaInsets();
  const {
    shareAnswers, scripturePreferences, load, setShareAnswers, setScripturePreferences,
  } = useSettings();
  const [languages, setLanguages] = useState<ScriptureLanguageOption[]>([]);
  const [translations, setTranslations] = useState<ScriptureTranslation[]>([]);
  const [language, setLanguage] = useState<ScriptureLanguageOption | null>(null);
  const [translation, setTranslation] = useState<ScriptureTranslation | null>(null);
  const [voice, setVoice] = useState<ScriptureVoice | null>(null);
  const [open, setOpen] = useState<OpenPicker>(null);
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [catalogError, setCatalogError] = useState(false);
  const translationRequest = useRef(0);
  const preferenceSave = useRef<Promise<void>>(Promise.resolve());

  const hydrate = async () => {
    setLoadingCatalog(true);
    setCatalogError(false);
    try {
      await load();
      const saved = useSettings.getState().scripturePreferences;
      const [languageCatalog, translationCatalog] = await Promise.all([
        fetchScriptureLanguages(),
        fetchScriptureTranslations(saved.language),
      ]);
      const savedLanguage = languageCatalog.find((item) => item.alias === saved.language) ?? null;
      const savedTranslation = translationCatalog.find(
        (item) => item.code === saved.translationCode,
      ) ?? null;
      const savedVoice = savedTranslation?.voices.find((item) => item.code === saved.voiceCode) ?? null;
      setLanguages(languageCatalog);
      setTranslations(translationCatalog);
      setLanguage(savedLanguage);
      setTranslation(savedTranslation);
      setVoice(savedVoice);
    } catch {
      setCatalogError(true);
    } finally {
      setLoadingCatalog(false);
    }
  };

  useEffect(() => {
    void hydrate();
  }, []);

  const loadTranslations = async (nextLanguage: ScriptureLanguageOption) => {
    const request = ++translationRequest.current;
    setLoadingCatalog(true);
    setCatalogError(false);
    try {
      const result = await fetchScriptureTranslations(nextLanguage.alias);
      if (request === translationRequest.current) setTranslations(result);
    } catch {
      if (request === translationRequest.current) setCatalogError(true);
    } finally {
      if (request === translationRequest.current) setLoadingCatalog(false);
    }
  };

  const chooseLanguage = (next: ScriptureLanguageOption) => {
    void Haptics.selectionAsync();
    setLanguage(next);
    setTranslation(null);
    setVoice(null);
    setTranslations([]);
    setOpen('translation');
    void loadTranslations(next);
  };

  const chooseTranslation = (next: ScriptureTranslation) => {
    void Haptics.selectionAsync();
    setTranslation(next);
    setVoice(null);
    setOpen('voice');
  };

  const chooseVoice = (next: ScriptureVoice) => {
    void Haptics.selectionAsync();
    setVoice(next);
    setOpen(null);
    if (!language || !translation) return;
    const preferences = preferencesFromCatalog(language, translation, next);
    if (!preferences) return;
    // Записи идут последовательно: при быстром выборе нескольких голосов
    // последним в SQLite гарантированно останется последний выбор пользователя.
    preferenceSave.current = preferenceSave.current
      .catch(() => undefined)
      .then(() => setScripturePreferences(preferences))
      .catch(() => undefined);
  };

  const togglePicker = (id: Exclude<OpenPicker, null>) => {
    void Haptics.selectionAsync();
    setOpen((current) => current === id ? null : id);
  };

  return (
    <View style={styles.root}>
      <ScreenBg />
      <Animated.View entering={FadeIn.duration(500)} style={{ flex: 1 }}>
        <View style={[styles.top, { paddingTop: insets.top + sc(10) }]}>
          <IconButton onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}>
            <ChevronLeft color={colors.goldSoft} />
          </IconButton>
          <Kicker>Настройки</Kicker>
          <View style={styles.topSpacer} />
        </View>

        <ScrollView
          style={{ flex: 1 }}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            paddingTop: sc(20),
            paddingHorizontal: sc(12),
            paddingBottom: insets.bottom + sc(24),
          }}
        >
          <Kicker style={styles.sectionKicker}>Перевод и озвучка</Kicker>
          <View style={styles.pickerStack}>
            <PickerCard
              id="language"
              label="Язык Библии"
              value={language?.nameNational ?? scripturePreferences.languageName}
              open={open === 'language'}
              disabled={loadingCatalog && languages.length === 0}
              onToggle={togglePicker}
            >
              {languages.map((item, index) => (
                <OptionRow
                  key={item.alias}
                  title={item.nameNational}
                  subtitle={item.nameEnglish !== item.nameNational ? item.nameEnglish : null}
                  selected={language?.alias === item.alias}
                  divided={index < languages.length - 1}
                  onPress={() => chooseLanguage(item)}
                  testID={`scripture-language-${item.alias}`}
                />
              ))}
            </PickerCard>

            <PickerCard
              id="translation"
              label="Перевод"
              value={translation?.name.trim() ?? (language ? 'Выберите перевод' : scripturePreferences.translationName.trim())}
              open={open === 'translation'}
              disabled={!language || loadingCatalog}
              onToggle={togglePicker}
            >
              {translations.map((item, index) => (
                <OptionRow
                  key={item.code}
                  title={item.name.trim()}
                  subtitle={
                    item.description?.trim() && item.description.trim() !== item.name.trim()
                      ? item.description.trim()
                      : null
                  }
                  selected={translation?.code === item.code}
                  divided={index < translations.length - 1}
                  onPress={() => chooseTranslation(item)}
                  testID={`scripture-translation-${item.code}`}
                />
              ))}
            </PickerCard>

            <PickerCard
              id="voice"
              label="Озвучка"
              value={voice?.name ?? (translation ? 'Выберите озвучку' : scripturePreferences.voiceName)}
              open={open === 'voice'}
              disabled={!translation}
              onToggle={togglePicker}
            >
              {(translation?.voices ?? []).map((item, index, voices) => (
                <OptionRow
                  key={item.code}
                  title={item.name}
                  subtitle={item.description}
                  selected={voice?.code === item.code}
                  divided={index < voices.length - 1}
                  onPress={() => chooseVoice(item)}
                  testID={`scripture-voice-${item.code}`}
                />
              ))}
            </PickerCard>
          </View>

          {loadingCatalog ? <Text style={styles.catalogMessage}>Загружаем доступные варианты…</Text> : null}
          {catalogError ? (
            <Pressable onPress={() => void hydrate()} style={styles.retryButton}>
              <Text style={styles.catalogMessage}>Не удалось загрузить список. Нажмите, чтобы повторить.</Text>
            </Pressable>
          ) : null}

          <Kicker style={[styles.sectionKicker, { marginTop: sc(24) }]}>Спутник</Kicker>
          <View style={styles.card}>
            <View style={styles.shareAnswersHeader}>
              <Text style={[styles.rowTitle, styles.shareAnswersTitle]}>
                Использовать ответы для цитат и вопросов
              </Text>
              <Toggle value={shareAnswers} onChange={setShareAnswers} />
            </View>
            <Text style={[styles.settingHint, styles.shareAnswersHint]}>
              {shareAnswers
                ? 'Текст ваших ответов будет отправляться на сервер приложения и передаваться провайдеру ИИ, чтобы вопросы и отрывки Писания учитывали контекст вашей молитвы. На сервере приложения ваши ответы не сохраняются.'
                : 'Текст ваших ответов не будет передаваться для подбора вопросов и отрывков Писания.'}
            </Text>
          </View>

          <Kicker style={[styles.sectionKicker, { marginTop: sc(22) }]}>Приложение</Kicker>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="О приложении"
            testID="about-button"
            onPress={() => router.push('/about')}
            style={({ pressed }) => [styles.card, styles.aboutLink, pressed && { opacity: 0.75 }]}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>О приложении</Text>
              <Text style={styles.linkHint}>Смысл, конфиденциальность и версия</Text>
            </View>
            <ChevronRight size={16} color={colors.labelGold} />
          </Pressable>
        </ScrollView>
      </Animated.View>
    </View>
  );
}

const stylesFactory = () => StyleSheet.create({
  root: { flex: 1, backgroundColor: '#080604' },
  top: {
    paddingHorizontal: sc(12),
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  topSpacer: { width: sc(34), height: sc(34) },
  sectionKicker: { marginBottom: sc(8), marginLeft: sc(4) },
  pickerStack: { gap: sc(6) },
  pickerCard: {
    overflow: 'hidden', backgroundColor: colors.cardBg, borderWidth: 1,
    borderColor: 'rgba(214,182,120,.22)', borderRadius: radius.md,
  },
  pickerCardOpen: { borderColor: 'rgba(230,162,60,.72)' },
  disabled: { opacity: 0.52 },
  pickerHeader: { minHeight: sc(53), flexDirection: 'row', alignItems: 'center', padding: sc(9) },
  pickerAccent: { width: sc(3), height: sc(28), borderRadius: 99, backgroundColor: 'rgba(214,182,120,.38)' },
  pickerAccentOpen: { backgroundColor: colors.amberBright },
  pickerHeading: { flex: 1, paddingHorizontal: sc(9) },
  pickerLabel: { fontFamily: fonts.sans, fontSize: sc(9.25), color: colors.warmHint },
  pickerValue: { marginTop: sc(1), fontFamily: fonts.sansMedium, fontSize: sc(13.25), color: colors.parchment },
  chevronCircle: {
    width: sc(27), height: sc(27), borderRadius: 99, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,.06)',
  },
  options: { marginHorizontal: sc(9), borderTopWidth: 1, borderTopColor: 'rgba(214,182,120,.16)' },
  optionRow: { minHeight: sc(51), flexDirection: 'row', alignItems: 'center', gap: sc(9), paddingVertical: sc(9) },
  optionDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(214,182,120,.12)',
  },
  optionPressed: { opacity: 0.62 },
  optionTitle: { fontFamily: fonts.sansMedium, fontSize: sc(13.5), color: colors.parchment },
  optionSelected: { color: colors.amberBright },
  optionSubtitle: { marginTop: sc(3), fontFamily: fonts.sans, fontSize: sc(10), lineHeight: sc(14), color: colors.warmHint },
  catalogMessage: { fontFamily: fonts.sans, fontSize: sc(10.5), color: colors.warmHint, textAlign: 'center', marginTop: sc(10) },
  retryButton: { paddingVertical: sc(4) },
  card: {
    backgroundColor: colors.cardBg, borderWidth: 1, borderColor: 'rgba(214,182,120,.22)',
    borderRadius: radius.md, padding: sc(14),
  },
  rowTitle: { fontFamily: fonts.sansMedium, fontSize: sc(13.5), color: colors.parchment },
  shareAnswersHeader: { flexDirection: 'row', alignItems: 'center', gap: sc(10) },
  shareAnswersTitle: { flex: 1, fontSize: sc(12), lineHeight: sc(16) },
  settingHint: {
    marginTop: sc(4), fontFamily: fonts.sans, fontSize: sc(10.5),
    lineHeight: sc(15), color: colors.warmHint,
  },
  shareAnswersHint: { marginTop: sc(3), fontSize: sc(9.25), lineHeight: sc(13.5) },
  aboutLink: { flexDirection: 'row', alignItems: 'center', gap: sc(10) },
  linkHint: { fontFamily: fonts.sans, fontSize: sc(10.5), lineHeight: sc(15), color: colors.warmHint },
  toggle: {
    flexShrink: 0, width: sc(40), height: sc(24), borderRadius: 999, backgroundColor: 'rgba(255,255,255,.08)',
    borderWidth: 1, borderColor: 'rgba(214,182,120,.26)', padding: sc(3), justifyContent: 'center',
  },
  toggleOn: { backgroundColor: 'rgba(230,162,60,.32)', borderColor: 'rgba(230,162,60,.6)' },
  knob: { width: sc(16), height: sc(16), borderRadius: 999, backgroundColor: 'rgba(240,225,195,.55)' },
  knobOn: { alignSelf: 'flex-end', backgroundColor: colors.amberBright },
});
