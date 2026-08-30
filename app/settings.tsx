import React, { useEffect, useRef, useState } from 'react';
import { Alert, AppState, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import ScreenBg from '../components/ScreenBg';
import { HintReveal, IconButton, Kicker } from '../components/ui';
import { Check, ChevronLeft, ChevronRight, Minus, Plus, Trash } from '../components/icons';
import { useSettings } from '../lib/settings';
import {
  DEFAULT_REMINDER_SCHEDULE,
  MAX_REMINDER_TIMES_PER_RULE,
  WEEKDAY_SHORT_NAMES,
  describeReminderSchedule,
  formatReminderTime,
  normalizeReminderSchedule,
  type ReminderRule,
  type ReminderSchedule,
  type ReminderTime,
} from '../lib/prayerReminders';
import {
  reminderPermissionAsync,
  requestReminderPermissionAsync,
  syncRemindersAsync,
  type ReminderPermission,
} from '../lib/prayerReminderScheduler';
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
import PinPrompt from '../components/PinPrompt';
import { screenReaderHiddenProps } from '../lib/a11y';
import {
  PIN_MAX_LENGTH,
  PIN_MIN_LENGTH,
  authenticateWithBiometrics,
  biometryInfo,
  changePin,
  disableLock,
  enableLock,
  setBiometrics,
  useLock,
  verifyPin,
  type BiometryInfo,
} from '../lib/lock';
import { colors, column, fonts, radius, sc, useStyles } from '../lib/theme';

type OpenPicker = 'language' | 'translation' | 'voice' | null;

/**
 * Шаг сценария ввода пина. `current` подтверждает право менять защиту,
 * `create` — придумать новый код, `repeat` — сверить его с повтором.
 * `current` хранит подтверждённый код только до конца смены пина.
 */
type PinFlow = {
  kind: 'enable' | 'disable' | 'change';
  step: 'current' | 'create' | 'repeat';
  current?: string;
  first?: string;
} | null;

function Toggle({ value, label, testID, onChange }: {
  value: boolean;
  label: string;
  testID: string;
  onChange: (v: boolean) => void;
}) {
  const styles = useStyles(stylesFactory);
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      testID={testID}
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

function StepButton({ label, onPress, children }: {
  label: string;
  onPress: () => void;
  children: React.ReactNode;
}) {
  const styles = useStyles(stylesFactory);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      onPress={() => {
        void Haptics.selectionAsync();
        onPress();
      }}
      style={({ pressed }) => [styles.stepBtn, pressed && styles.optionPressed]}
    >
      {children}
    </Pressable>
  );
}

/** Час шагает по часу, минуты — по пять; значение закольцовано внутри суток. */
function TimeRow({ time, canRemove, onShift, onRemove }: {
  time: ReminderTime;
  canRemove: boolean;
  onShift: (deltaMinutes: number) => void;
  onRemove: () => void;
}) {
  const styles = useStyles(stylesFactory);
  const label = formatReminderTime(time);
  const [hour, minute] = label.split(':');
  return (
    <View style={styles.timeRow} testID={`reminder-time-${label}`}>
      <StepButton label={`${label}: час назад`} onPress={() => onShift(-60)}>
        <Minus size={sc(14)} color={colors.white65} />
      </StepButton>
      <Text style={styles.timeUnit}>{hour}</Text>
      <StepButton label={`${label}: час вперёд`} onPress={() => onShift(60)}>
        <Plus size={sc(14)} color={colors.white65} />
      </StepButton>
      <Text style={styles.timeColon}>:</Text>
      <StepButton label={`${label}: пять минут назад`} onPress={() => onShift(-5)}>
        <Minus size={sc(14)} color={colors.white65} />
      </StepButton>
      <Text style={styles.timeUnit}>{minute}</Text>
      <StepButton label={`${label}: пять минут вперёд`} onPress={() => onShift(5)}>
        <Plus size={sc(14)} color={colors.white65} />
      </StepButton>
      <View style={{ flex: 1 }} />
      {canRemove ? (
        <StepButton label={`Убрать напоминание в ${label}`} onPress={onRemove}>
          <Trash size={sc(14)} />
        </StepButton>
      ) : null}
    </View>
  );
}

export default function Settings() {
  const styles = useStyles(stylesFactory);
  const insets = useSafeAreaInsets();
  const {
    shareAnswers, scripturePreferences, reminderSchedule,
    load, setShareAnswers, setScripturePreferences, setReminderSchedule,
  } = useSettings();
  const lockEnabled = useLock((s) => s.enabled);
  const biometricsEnabled = useLock((s) => s.biometrics);
  const lockPinLength = useLock((s) => s.pinLength);
  const [biometry, setBiometry] = useState<BiometryInfo | null>(null);
  const [pinFlow, setPinFlow] = useState<PinFlow>(null);
  const [reminderPermission, setReminderPermission] = useState<ReminderPermission>('undetermined');
  const reminderSave = useRef<Promise<void>>(Promise.resolve());
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

  // Разрешение могло измениться в системных настройках, пока приложение было в
  // фоне: перечитываем его при каждом возвращении на передний план.
  useEffect(() => {
    let alive = true;
    let known: ReminderPermission | null = null;
    const refresh = () => {
      void reminderPermissionAsync().then((status) => {
        if (!alive) return;
        const changed = known !== null && known !== status;
        known = status;
        setReminderPermission(status);
        // Разрешение могли вернуть в системных настройках — тогда расписание
        // нужно снова уложить в систему. При запуске это уже сделал _layout.
        if (changed) void syncRemindersAsync(useSettings.getState().reminderSchedule);
      });
    };
    refresh();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);

  // Биометрию могли зарегистрировать или удалить в системных настройках, пока
  // приложение было в фоне: тумблер должен появляться и исчезать вслед за этим.
  useEffect(() => {
    let alive = true;
    const refresh = () => {
      void biometryInfo().then((info) => {
        if (alive) setBiometry(info);
      });
    };
    refresh();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);

  const startEnableLock = () => setPinFlow({ kind: 'enable', step: 'create' });
  const startDisableLock = () => setPinFlow({ kind: 'disable', step: 'current' });
  const startChangePin = () => {
    void Haptics.selectionAsync();
    setPinFlow({ kind: 'change', step: 'current' });
  };

  /**
   * Один обработчик на все шаги ввода. Возвращает `null`, когда ввод принят, и
   * текст ошибки, когда нет: поле само трясётся и очищается.
   */
  const submitPinFlow = async (pin: string): Promise<string | null> => {
    const flow = pinFlow;
    if (!flow) return 'Не удалось продолжить';

    if (flow.step === 'current') {
      if (!(await verifyPin(pin))) return 'Неверный пин-код';
      if (flow.kind === 'disable') {
        await disableLock();
        setPinFlow(null);
        return null;
      }
      setPinFlow({ kind: 'change', step: 'create', current: pin });
      return null;
    }

    if (flow.step === 'create') {
      setPinFlow({ ...flow, step: 'repeat', first: pin });
      return null;
    }

    if (pin !== flow.first) {
      // Не совпало — возвращаемся к придумыванию кода: заставлять человека
      // вслепую повторять код, который он мог набрать с опечаткой, бессмысленно.
      setPinFlow({ ...flow, step: 'create', first: undefined });
      return 'Коды не совпали. Придумайте код заново.';
    }

    if (flow.kind === 'change') {
      if (!(await changePin(flow.current ?? '', pin))) {
        setPinFlow({ kind: 'change', step: 'current' });
        return 'Не удалось сменить пин-код';
      }
    } else {
      await enableLock(pin);
    }
    setPinFlow(null);
    return null;
  };

  const toggleBiometrics = async (next: boolean) => {
    if (!next) {
      await setBiometrics(false);
      return;
    }
    const info = await biometryInfo();
    setBiometry(info);
    if (!info.available) return;
    // Включаем только после успешной проверки: человек сразу видит, что способ
    // работает, а не обнаруживает это на заблокированном экране.
    const result = await authenticateWithBiometrics(`Подтвердите включение ${info.label}`);
    if (result.ok) {
      await setBiometrics(true);
      return;
    }
    // Отмену пользователем не комментируем — тумблер просто остаётся
    // выключенным, как если бы его и не трогали. А вот настоящую ошибку
    // молчать нельзя: до этой правки человек не видел, почему включение
    // не сработало.
    if (result.reason === 'error') {
      Alert.alert('Не удалось включить Face ID / Touch ID', result.message);
    }
  };

  const pinPrompt = (() => {
    if (!pinFlow) return null;
    if (pinFlow.step === 'current') {
      return {
        title: pinFlow.kind === 'disable' ? 'Введите пин-код' : 'Текущий пин-код',
        subtitle:
          pinFlow.kind === 'disable'
            ? 'Подтвердите, что защиту выключаете вы'
            : 'Подтвердите, что код меняете вы',
        expectedLength: lockPinLength,
      };
    }
    if (pinFlow.step === 'create') {
      return {
        title: pinFlow.kind === 'change' ? 'Новый пин-код' : 'Придумайте пин-код',
        subtitle: `От ${PIN_MIN_LENGTH} до ${PIN_MAX_LENGTH} цифр.\nНажмите галочку, когда закончите.`,
        expectedLength: undefined,
      };
    }
    return {
      title: 'Повторите пин-код',
      subtitle: 'Наберите тот же код ещё раз',
      expectedLength: undefined,
    };
  })();

  // Правило, которое редактирует этот экран. Модель допускает несколько правил
  // (их принесёт разбор фразы на этапе 2), простой выбор дней и времени —
  // всегда одно.
  const reminderRules = reminderSchedule.rules.length
    ? reminderSchedule.rules
    : DEFAULT_REMINDER_SCHEDULE.rules;
  const reminderRule = reminderRules[0];

  // Запись и переплан идут строго последовательно: при быстрых нажатиях в
  // системе останется расписание, соответствующее последнему нажатию.
  const applyReminderSchedule = (next: ReminderSchedule) => {
    const normalized = normalizeReminderSchedule(next) ?? DEFAULT_REMINDER_SCHEDULE;
    reminderSave.current = reminderSave.current
      .catch(() => undefined)
      .then(async () => {
        await setReminderSchedule(normalized);
        await syncRemindersAsync(normalized);
      })
      .catch(() => undefined);
  };

  const editReminderRule = (update: (rule: ReminderRule) => ReminderRule) => {
    void Haptics.selectionAsync();
    applyReminderSchedule({
      enabled: reminderSchedule.enabled,
      rules: [update(reminderRule), ...reminderRules.slice(1)],
    });
  };

  const toggleReminders = async (next: boolean) => {
    void Haptics.selectionAsync();
    if (!next) {
      applyReminderSchedule({ enabled: false, rules: reminderRules });
      return;
    }
    // Разрешение спрашиваем ровно здесь — в момент, когда пользователь сам
    // включает напоминания, а не при старте приложения.
    const status = await requestReminderPermissionAsync();
    setReminderPermission(status);
    // Без разрешения включать нечего: тумблер честно остаётся выключенным.
    if (status !== 'granted') return;
    applyReminderSchedule({ enabled: true, rules: reminderRules });
  };

  const toggleReminderWeekday = (isoWeekday: number) => {
    const selected = reminderRule.weekdays.includes(isoWeekday);
    // Последний день снять нельзя: расписание без дней — это выключенные
    // напоминания, а для этого есть тумблер.
    if (selected && reminderRule.weekdays.length === 1) return;
    editReminderRule((rule) => ({
      ...rule,
      weekdays: selected
        ? rule.weekdays.filter((day) => day !== isoWeekday)
        : [...rule.weekdays, isoWeekday],
    }));
  };

  const timeAt = (minutes: number): ReminderTime => ({
    hour: Math.floor(minutes / 60),
    minute: minutes % 60,
  });
  const takenMinutes = new Set(reminderRule.times.map((time) => time.hour * 60 + time.minute));

  const shiftReminderTime = (index: number, deltaMinutes: number) => {
    const current = reminderRule.times[index];
    const next = (current.hour * 60 + current.minute + deltaMinutes + 1440) % 1440;
    // Наехать одним временем на другое нельзя: нормализация слила бы их, и одно
    // напоминание молча исчезло бы после одного нажатия.
    if (takenMinutes.has(next)) return;
    editReminderRule((rule) => ({
      ...rule,
      times: rule.times.map((time, i) => (i === index ? timeAt(next) : time)),
    }));
  };

  const addReminderTime = () => {
    const last = reminderRule.times[reminderRule.times.length - 1];
    const from = last ? last.hour * 60 + last.minute : 8 * 60;
    let candidate = from;
    for (let step = 1; step <= 24; step += 1) {
      candidate = (from + step * 60) % 1440;
      if (!takenMinutes.has(candidate)) break;
    }
    if (takenMinutes.has(candidate)) return;
    editReminderRule((rule) => ({ ...rule, times: [...rule.times, timeAt(candidate)] }));
  };

  const removeReminderTime = (index: number) => {
    editReminderRule((rule) => ({
      ...rule,
      times: rule.times.filter((_, i) => i !== index),
    }));
  };

  const reminderSummary = describeReminderSchedule(reminderSchedule);

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
      {/* Пометка для TalkBack: пока сверху висит ввод пина, настроек под ним
          для программы чтения с экрана не существует. На iOS то же делает сам
          PinPrompt флагом accessibilityViewIsModal (см. lib/a11y).
          ScreenBg остаётся непомеченным намеренно: это декоративный холст
          Skia, узлов доступности он не создаёт. */}
      <Animated.View
        entering={FadeIn.duration(500)}
        style={styles.screen}
        {...screenReaderHiddenProps(!!pinPrompt)}
      >
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

          <Kicker style={[styles.sectionKicker, { marginTop: sc(24) }]}>Напоминания</Kicker>
          <View style={styles.card}>
            <View style={styles.shareAnswersHeader}>
              <Text style={[styles.rowTitle, styles.shareAnswersTitle]}>
                Напоминать о молитве
              </Text>
              <Toggle
                value={reminderSchedule.enabled}
                label="Напоминать о молитве"
                testID="reminders-toggle"
                onChange={(next) => void toggleReminders(next)}
              />
            </View>

            <Text style={[styles.settingHint, styles.shareAnswersHint]} testID="reminders-summary">
              {reminderSchedule.enabled && reminderSummary
                ? reminderSummary
                : 'Тихое напоминание в выбранное время. Уведомления локальные: интернет для них не нужен.'}
            </Text>

            {reminderPermission === 'denied' ? (
              <Text
                style={[styles.settingHint, styles.shareAnswersHint, styles.reminderWarning]}
                testID="reminders-permission-warning"
              >
                Уведомления запрещены в настройках системы, поэтому напоминания не приходят.
                Разрешите уведомления для Twinkler и вернитесь на этот экран.
              </Text>
            ) : null}

            {reminderSchedule.enabled ? (
              <View style={styles.reminderEditor}>
                <Text style={styles.reminderLabel}>Дни недели</Text>
                <View style={styles.dayRow}>
                  {WEEKDAY_SHORT_NAMES.map((name, index) => {
                    const isoWeekday = index + 1;
                    const selected = reminderRule.weekdays.includes(isoWeekday);
                    return (
                      <Pressable
                        key={name}
                        accessibilityRole="button"
                        accessibilityLabel={name}
                        accessibilityState={{ selected }}
                        testID={`reminder-day-${isoWeekday}`}
                        onPress={() => toggleReminderWeekday(isoWeekday)}
                        style={({ pressed }) => [
                          styles.dayChip,
                          selected && styles.dayChipOn,
                          pressed && styles.optionPressed,
                        ]}
                      >
                        <Text style={[styles.dayChipText, selected && styles.dayChipTextOn]}>
                          {name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                <Text style={styles.reminderLabel}>Время</Text>
                {reminderRule.times.map((time, index) => (
                  <TimeRow
                    key={formatReminderTime(time)}
                    time={time}
                    canRemove={reminderRule.times.length > 1}
                    onShift={(delta) => shiftReminderTime(index, delta)}
                    onRemove={() => removeReminderTime(index)}
                  />
                ))}

                {reminderRule.times.length < MAX_REMINDER_TIMES_PER_RULE ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Добавить время"
                    testID="reminder-add-time"
                    onPress={addReminderTime}
                    style={({ pressed }) => [styles.addTime, pressed && styles.optionPressed]}
                  >
                    <Text style={styles.addTimeText}>+ Добавить время</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}
          </View>

          <Kicker style={[styles.sectionKicker, { marginTop: sc(24) }]}>Спутник</Kicker>
          <View style={styles.card}>
            <View style={styles.shareAnswersHeader}>
              <Text style={[styles.rowTitle, styles.shareAnswersTitle]}>
                Использовать ответы для цитат и вопросов
              </Text>
              <Toggle
                value={shareAnswers}
                label="Использовать ответы для цитат и вопросов"
                testID="share-answers-toggle"
                onChange={setShareAnswers}
              />
            </View>
            {shareAnswers ? (
              <HintReveal
                testID="share-answers-hint-help"
                style={[styles.settingHint, styles.shareAnswersHint]}
                summary="Текст ваших ответов будет отправляться на сервер приложения и провайдеру ИИ."
                details="Это нужно, чтобы вопросы и отрывки Писания учитывали контекст вашей молитвы. На сервере приложения ответы не сохраняются."
              />
            ) : (
              <Text style={[styles.settingHint, styles.shareAnswersHint]}>
                Текст ваших ответов не будет передаваться для подбора вопросов и отрывков Писания.
              </Text>
            )}
          </View>

          <Kicker style={[styles.sectionKicker, { marginTop: sc(24) }]}>Защита</Kicker>
          <View style={styles.card}>
            <View style={styles.shareAnswersHeader}>
              <Text style={[styles.rowTitle, styles.shareAnswersTitle]}>Пин-код</Text>
              <Toggle
                value={lockEnabled}
                label="Пин-код"
                testID="lock-toggle"
                onChange={(next) => (next ? startEnableLock() : startDisableLock())}
              />
            </View>
            <HintReveal
              testID="lock-hint-help"
              style={[styles.settingHint, styles.shareAnswersHint]}
              summary={
                lockEnabled
                  ? 'Код спрашивается при открытии приложения.'
                  : 'Забытый код не восстановить — только стереть все данные приложения.'
              }
              details={
                lockEnabled
                  ? 'И после минуты в фоне. Короткое переключение на другое приложение код не запрашивает.'
                  : `Код из ${PIN_MIN_LENGTH}–${PIN_MAX_LENGTH} цифр закроет дневник, ответы и записи от посторонних глаз. Хранится только на этом устройстве.`
              }
            />

            {lockEnabled ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Сменить пин-код"
                testID="change-pin-button"
                onPress={startChangePin}
                style={({ pressed }) => [styles.lockRow, pressed && { opacity: 0.7 }]}
              >
                <Text style={[styles.rowTitle, { flex: 1 }]}>Сменить пин-код</Text>
                <ChevronRight size={16} color={colors.labelGold} />
              </Pressable>
            ) : null}

            {/* Биометрия существует только поверх пина: без кода не осталось бы
                запасного входа, если Face ID перестанет узнавать. */}
            {lockEnabled && biometry?.available ? (
              <View style={styles.lockRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{biometry.label}</Text>
                  <Text style={[styles.settingHint, styles.shareAnswersHint]}>
                    Пин-код остаётся запасным способом.
                  </Text>
                </View>
                <Toggle
                  value={biometricsEnabled}
                  label={biometry.label}
                  testID="biometrics-toggle"
                  onChange={(next) => void toggleBiometrics(next)}
                />
              </View>
            ) : null}
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

      {/* Поверх экрана, а не системным Modal: иначе окно ввода закрыло бы собой
          шторку приватности и экран блокировки при сворачивании приложения. */}
      {pinPrompt ? (
        <PinPrompt
          title={pinPrompt.title}
          subtitle={pinPrompt.subtitle}
          expectedLength={pinPrompt.expectedLength}
          onSubmit={submitPinFlow}
          onCancel={() => setPinFlow(null)}
        />
      ) : null}
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
  reminderWarning: { color: 'rgba(240,170,120,.92)' },
  reminderEditor: { marginTop: sc(12), gap: sc(6) },
  reminderLabel: {
    fontFamily: fonts.sans, fontSize: sc(9.25), color: colors.warmHint, marginTop: sc(4),
  },
  dayRow: { flexDirection: 'row', gap: sc(4) },
  dayChip: {
    flex: 1, minHeight: sc(30), alignItems: 'center', justifyContent: 'center',
    borderRadius: radius.sm, backgroundColor: colors.white05,
    borderWidth: 1, borderColor: 'rgba(214,182,120,.18)',
  },
  dayChipOn: { backgroundColor: 'rgba(230,162,60,.22)', borderColor: 'rgba(230,162,60,.6)' },
  dayChipText: { fontFamily: fonts.sansMedium, fontSize: sc(11), color: colors.creamDim },
  dayChipTextOn: { color: colors.amberBright },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: sc(4) },
  stepBtn: {
    width: sc(26), height: sc(26), alignItems: 'center', justifyContent: 'center',
    borderRadius: radius.sm, backgroundColor: colors.white05,
    borderWidth: 1, borderColor: 'rgba(214,182,120,.18)',
  },
  timeUnit: {
    minWidth: sc(24), textAlign: 'center',
    fontFamily: fonts.monoMedium, fontSize: sc(14), color: colors.parchment,
  },
  timeColon: { fontFamily: fonts.monoMedium, fontSize: sc(14), color: colors.labelGold },
  addTime: { paddingVertical: sc(6) },
  addTimeText: { fontFamily: fonts.sansMedium, fontSize: sc(11.5), color: colors.goldSoft },
  lockRow: {
    marginTop: sc(12),
    paddingTop: sc(12),
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(214,182,120,.16)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: sc(10),
  },
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
