import React, { useEffect, useRef, useState } from 'react';
import { Alert, AppState, BackHandler, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import ScreenBg from '../components/ScreenBg';
import { IconButton, Kicker } from '../components/ui';
import { Check, ChevronLeft, ChevronRight, Close, Minus, Plus, Trash } from '../components/icons';
import { useSettings } from '../lib/settings';
import {
  DEFAULT_REMINDER_SCHEDULE,
  MAX_REMINDER_RULES,
  MAX_REMINDER_TIMES_PER_RULE,
  WEEKDAY_SHORT_NAMES,
  describeReminderSchedule,
  formatReminderTime,
  formatReminderWeekdays,
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
function TimeRow({ time, ruleIndex, canRemove, onShift, onRemove }: {
  time: ReminderTime;
  ruleIndex: number;
  canRemove: boolean;
  onShift: (deltaMinutes: number) => void;
  onRemove: () => void;
}) {
  const styles = useStyles(stylesFactory);
  const label = formatReminderTime(time);
  const [hour, minute] = label.split(':');
  return (
    <View style={styles.timeRow} testID={`reminder-rule-${ruleIndex}-time-${label}`}>
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
  const [reminderEditorRuleIndex, setReminderEditorRuleIndex] = useState<number | null>(null);
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
    if (reminderEditorRuleIndex === null) return undefined;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      setReminderEditorRuleIndex(null);
      return true;
    });
    return () => subscription.remove();
  }, [reminderEditorRuleIndex]);

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
        // Предупреждение о невосстановимости показывается именно в момент
        // установки кода — на экране настроек его больше нет.
        subtitle:
          pinFlow.kind === 'change'
            ? `От ${PIN_MIN_LENGTH} до ${PIN_MAX_LENGTH} цифр.\nНажмите галочку, когда закончите.`
            : `От ${PIN_MIN_LENGTH} до ${PIN_MAX_LENGTH} цифр.\nЗабытый код не восстановить — войти получится, лишь стерев все данные.`,
        expectedLength: undefined,
      };
    }
    return {
      title: 'Повторите пин-код',
      subtitle: 'Наберите тот же код ещё раз',
      expectedLength: undefined,
    };
  })();

  // Экран редактирует тот же массив правил, который модель разворачивает в
  // WEEKLY-триггеры: у каждого набора дней может быть собственный список времён.
  const reminderRules = reminderSchedule.rules.length
    ? reminderSchedule.rules
    : DEFAULT_REMINDER_SCHEDULE.rules;

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

  const editReminderRule = (ruleIndex: number, update: (rule: ReminderRule) => ReminderRule) => {
    void Haptics.selectionAsync();
    const updatedRule = update(reminderRules[ruleIndex]);
    const next = normalizeReminderSchedule({
      enabled: reminderSchedule.enabled,
      rules: reminderRules.map((rule, index) => index === ruleIndex ? updatedRule : rule),
    }) ?? DEFAULT_REMINDER_SCHEDULE;
    applyReminderSchedule(next);
    if (reminderEditorRuleIndex === ruleIndex) {
      const weekdayKey = [...updatedRule.weekdays].sort((a, b) => a - b).join(',');
      const nextIndex = next.rules.findIndex((rule) => rule.weekdays.join(',') === weekdayKey);
      setReminderEditorRuleIndex(nextIndex >= 0 ? nextIndex : null);
    }
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

  const toggleReminderWeekday = (ruleIndex: number, isoWeekday: number) => {
    const reminderRule = reminderRules[ruleIndex];
    const selected = reminderRule.weekdays.includes(isoWeekday);
    // Последний день снять нельзя: расписание без дней — это выключенные
    // напоминания, а для этого есть тумблер.
    if (selected && reminderRule.weekdays.length === 1) return;
    editReminderRule(ruleIndex, (rule) => ({
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
  const shiftReminderTime = (ruleIndex: number, timeIndex: number, deltaMinutes: number) => {
    const reminderRule = reminderRules[ruleIndex];
    const takenMinutes = new Set(reminderRule.times.map((time) => time.hour * 60 + time.minute));
    const current = reminderRule.times[timeIndex];
    const next = (current.hour * 60 + current.minute + deltaMinutes + 1440) % 1440;
    // Наехать одним временем на другое нельзя: нормализация слила бы их, и одно
    // напоминание молча исчезло бы после одного нажатия.
    if (takenMinutes.has(next)) return;
    editReminderRule(ruleIndex, (rule) => ({
      ...rule,
      times: rule.times.map((time, index) => (index === timeIndex ? timeAt(next) : time)),
    }));
  };

  const addReminderTime = (ruleIndex: number) => {
    const reminderRule = reminderRules[ruleIndex];
    const takenMinutes = new Set(reminderRule.times.map((time) => time.hour * 60 + time.minute));
    const last = reminderRule.times[reminderRule.times.length - 1];
    const from = last ? last.hour * 60 + last.minute : 8 * 60;
    let candidate = from;
    for (let step = 1; step <= 24; step += 1) {
      candidate = (from + step * 60) % 1440;
      if (!takenMinutes.has(candidate)) break;
    }
    if (takenMinutes.has(candidate)) return;
    editReminderRule(ruleIndex, (rule) => ({ ...rule, times: [...rule.times, timeAt(candidate)] }));
  };

  const removeReminderTime = (ruleIndex: number, timeIndex: number) => {
    editReminderRule(ruleIndex, (rule) => ({
      ...rule,
      times: rule.times.filter((_, index) => index !== timeIndex),
    }));
  };

  const addReminderRule = () => {
    if (reminderRules.length >= MAX_REMINDER_RULES) return null;
    void Haptics.selectionAsync();
    const existingWeekdays = new Set(reminderRules.map((rule) => rule.weekdays.join(',')));
    const weekdayCandidates = [
      [6, 7],
      [1, 2, 3, 4, 5],
      ...Array.from({ length: 7 }, (_, index) => [index + 1]),
    ];
    const weekdays = weekdayCandidates.find((days) => !existingWeekdays.has(days.join(',')))
      ?? [1, 2, 3, 4, 5, 6, 7];
    const latestMinutes = reminderRules.reduce(
      (latest, rule) => Math.max(latest, ...rule.times.map((time) => time.hour * 60 + time.minute)),
      8 * 60,
    );
    const newRule = { weekdays, times: [timeAt((latestMinutes + 60) % 1440)] };
    const next = normalizeReminderSchedule({
      enabled: reminderSchedule.enabled,
      rules: [...reminderRules, newRule],
    }) ?? DEFAULT_REMINDER_SCHEDULE;
    applyReminderSchedule(next);
    return next.rules.findIndex((rule) => rule.weekdays.join(',') === weekdays.join(','));
  };

  const removeReminderRule = (ruleIndex: number) => {
    if (reminderRules.length <= 1) return;
    void Haptics.selectionAsync();
    applyReminderSchedule({
      enabled: reminderSchedule.enabled,
      rules: reminderRules.filter((_, index) => index !== ruleIndex),
    });
    if (reminderEditorRuleIndex === ruleIndex) setReminderEditorRuleIndex(null);
  };

  const activeReminderRule = reminderEditorRuleIndex === null
    ? null
    : reminderRules[reminderEditorRuleIndex] ?? null;
  const activeReminderSummary = activeReminderRule
    ? describeReminderSchedule({ enabled: true, rules: [activeReminderRule] })
    : '';

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
        {...screenReaderHiddenProps(!!pinPrompt || reminderEditorRuleIndex !== null)}
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
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>
                  Напоминать о молитве
                </Text>
                {reminderPermission === 'denied' ? (
                  <Text
                    style={[styles.settingHint, styles.shareAnswersHint, styles.reminderWarning]}
                    testID="reminders-permission-warning"
                  >
                    Уведомления запрещены в настройках системы.
                  </Text>
                ) : null}
              </View>
              <Toggle
                value={reminderSchedule.enabled}
                label="Напоминать о молитве"
                testID="reminders-toggle"
                onChange={(next) => void toggleReminders(next)}
              />
            </View>

            {reminderRules.map((rule, ruleIndex) => {
              const summary = describeReminderSchedule({ enabled: true, rules: [rule] });
              return (
                <Pressable
                  key={ruleIndex}
                  accessibilityRole="button"
                  accessibilityLabel={`Настроить расписание ${ruleIndex + 1}: ${summary}`}
                  testID={`reminders-settings-button-${ruleIndex}`}
                  onPress={() => setReminderEditorRuleIndex(ruleIndex)}
                  style={({ pressed }) => [
                    styles.reminderSettingsRow,
                    styles.reminderRuleSettingsRow,
                    ruleIndex === 0 && styles.firstReminderSettingsRow,
                    pressed && styles.optionPressed,
                  ]}
                >
                  <View
                    style={styles.reminderSettingsCopy}
                    testID={ruleIndex === 0 ? 'reminders-summary' : `reminders-summary-${ruleIndex}`}
                  >
                    <Text
                      style={styles.reminderSettingsTitle}
                      numberOfLines={1}
                    >
                      {formatReminderWeekdays(rule.weekdays)}
                    </Text>
                    <Text style={styles.reminderSettingsSubtitle} numberOfLines={1}>
                      {rule.times.map(formatReminderTime).join(', ')}
                    </Text>
                  </View>
                  <ChevronRight size={sc(15)} color={colors.labelGold} />
                </Pressable>
              );
            })}

            {reminderRules.length < MAX_REMINDER_RULES ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Добавить расписание"
                testID="reminders-add-rule"
                hitSlop={8}
                onPress={() => {
                  const newRuleIndex = addReminderRule();
                  if (newRuleIndex !== null && newRuleIndex >= 0) {
                    setReminderEditorRuleIndex(newRuleIndex);
                  }
                }}
                style={({ pressed }) => [
                  styles.reminderSettingsRow,
                  styles.addScheduleRow,
                  pressed && styles.optionPressed,
                ]}
              >
                <Text style={[styles.rowTitle, styles.addScheduleTitle]}>Добавить расписание</Text>
                <Plus size={sc(15)} color={colors.labelGold} />
              </Pressable>
            ) : null}

          </View>

          <Kicker style={[styles.sectionKicker, { marginTop: sc(24) }]}>Конфиденциальность</Kicker>
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
            <Text style={[styles.settingHint, styles.shareAnswersHint]}>
              {shareAnswers
                ? 'Текст ваших ответов и сделанные расшифровки голосовых записей будут '
                  + 'отправляться на сервер приложения и провайдеру ИИ, чтобы вопросы и отрывки '
                  + 'Писания учитывали контекст вашей молитвы. На сервере приложения они не сохраняются.'
                : 'Текст ваших ответов и расшифровки не будут передаваться для подбора вопросов '
                  + 'и отрывков Писания.'}
            </Text>

            <View style={[styles.shareAnswersHeader, styles.lockRow]}>
              <Text style={[styles.rowTitle, styles.shareAnswersTitle]}>Пин-код</Text>
              <Toggle
                value={lockEnabled}
                label="Пин-код"
                testID="lock-toggle"
                onChange={(next) => (next ? startEnableLock() : startDisableLock())}
              />
            </View>
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
            </View>
            <ChevronRight size={16} color={colors.labelGold} />
          </Pressable>
        </ScrollView>
      </Animated.View>

      {activeReminderRule && reminderEditorRuleIndex !== null ? (
        <View style={styles.reminderModalBackdrop} accessibilityViewIsModal>
          <Pressable
            accessibilityLabel="Закрыть настройку напоминаний"
            style={StyleSheet.absoluteFill}
            onPress={() => setReminderEditorRuleIndex(null)}
          />
          <View
            testID="reminders-editor-modal"
            style={[
              styles.reminderModal,
              { paddingBottom: Math.max(insets.bottom, sc(14)) },
            ]}
          >
            <View style={styles.reminderModalHandle} />
            <View style={styles.reminderModalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.reminderModalKicker}>НАПОМИНАНИЯ</Text>
                <Text style={styles.reminderModalTitle}>Когда напоминать</Text>
              </View>
              {reminderRules.length > 1 ? (
                <IconButton
                  accessibilityLabel={`Удалить расписание ${reminderEditorRuleIndex + 1}`}
                  onPress={() => removeReminderRule(reminderEditorRuleIndex)}
                >
                  <Trash size={sc(14)} color={colors.white65} />
                </IconButton>
              ) : null}
              <IconButton
                accessibilityLabel="Закрыть настройку напоминаний"
                onPress={() => setReminderEditorRuleIndex(null)}
              >
                <Close size={sc(14)} />
              </IconButton>
            </View>

            {activeReminderSummary ? (
              <View style={styles.reminderModalSummaryPill}>
                <View style={styles.reminderModalSummaryDot} />
                <Text style={styles.reminderModalSummary}>{activeReminderSummary}</Text>
              </View>
            ) : null}

            <ScrollView
              bounces={false}
              contentContainerStyle={styles.reminderModalContent}
            >
              <View style={styles.reminderEditor}>
                <View
                  style={styles.reminderRuleCard}
                  testID={`reminder-rule-${reminderEditorRuleIndex}`}
                >
                    <Text style={styles.reminderLabel}>ДНИ НЕДЕЛИ</Text>
                    <View style={styles.dayRow}>
                      {WEEKDAY_SHORT_NAMES.map((name, dayIndex) => {
                        const isoWeekday = dayIndex + 1;
                        const selected = activeReminderRule.weekdays.includes(isoWeekday);
                        return (
                          <Pressable
                            key={name}
                            accessibilityRole="button"
                            accessibilityLabel={`${name}, расписание ${reminderEditorRuleIndex + 1}`}
                            accessibilityState={{ selected }}
                            testID={`reminder-rule-${reminderEditorRuleIndex}-day-${isoWeekday}`}
                            onPress={() => toggleReminderWeekday(reminderEditorRuleIndex, isoWeekday)}
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

                    <Text style={[styles.reminderLabel, styles.reminderTimeLabel]}>ВРЕМЯ</Text>
                    <View style={styles.reminderTimes}>
                      {activeReminderRule.times.map((time, timeIndex) => (
                        <TimeRow
                          key={formatReminderTime(time)}
                          time={time}
                          ruleIndex={reminderEditorRuleIndex}
                          canRemove={activeReminderRule.times.length > 1}
                          onShift={(delta) => shiftReminderTime(reminderEditorRuleIndex, timeIndex, delta)}
                          onRemove={() => removeReminderTime(reminderEditorRuleIndex, timeIndex)}
                        />
                      ))}
                    </View>

                    {activeReminderRule.times.length < MAX_REMINDER_TIMES_PER_RULE ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Добавить время в расписание ${reminderEditorRuleIndex + 1}`}
                        testID={`reminder-add-time-${reminderEditorRuleIndex}`}
                        onPress={() => addReminderTime(reminderEditorRuleIndex)}
                        style={({ pressed }) => [styles.addTime, pressed && styles.optionPressed]}
                      >
                        <Plus size={sc(13)} color={colors.white65} />
                        <Text style={styles.addTimeText}>Добавить время</Text>
                      </Pressable>
                    ) : null}
                </View>
              </View>
            </ScrollView>

            <Pressable
              accessibilityRole="button"
              testID="reminders-editor-done"
              onPress={() => setReminderEditorRuleIndex(null)}
              style={({ pressed }) => [styles.reminderDone, pressed && styles.optionPressed]}
            >
              <Text style={styles.reminderDoneText}>Готово</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

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
    borderRadius: radius.md, padding: sc(12),
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
  reminderSettingsRow: {
    marginTop: sc(8), paddingTop: sc(8),
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(214,182,120,.16)',
    flexDirection: 'row', alignItems: 'center', gap: sc(10),
  },
  reminderRuleSettingsRow: { minHeight: sc(44) },
  firstReminderSettingsRow: { marginTop: sc(12) },
  reminderSettingsCopy: { flex: 1, gap: 0 },
  reminderSettingsTitle: {
    fontFamily: fonts.sansMedium, fontSize: sc(13.5), color: colors.parchment,
  },
  reminderSettingsSubtitle: {
    fontFamily: fonts.sans, fontSize: sc(10.5), lineHeight: sc(15), color: colors.warmHint,
  },
  addScheduleRow: { paddingTop: sc(12) },
  addScheduleTitle: { flex: 1, color: colors.warmHint },
  reminderModalBackdrop: {
    position: 'absolute', top: 0, right: 0, bottom: 0, left: 0,
    justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,.78)',
  },
  reminderModal: {
    maxHeight: '82%', paddingTop: sc(7), paddingHorizontal: sc(14),
    backgroundColor: '#171109', borderTopLeftRadius: sc(22), borderTopRightRadius: sc(22),
    borderWidth: 1, borderBottomWidth: 0, borderColor: 'rgba(214,182,120,.2)',
    shadowColor: '#000', shadowOffset: { width: 0, height: -8 }, shadowOpacity: 0.42,
    shadowRadius: sc(18), elevation: 20,
  },
  reminderModalHandle: {
    alignSelf: 'center', width: sc(34), height: sc(3), borderRadius: 99,
    marginBottom: sc(8), backgroundColor: 'rgba(255,255,255,.16)',
  },
  reminderModalHeader: {
    flexDirection: 'row', alignItems: 'center', gap: sc(10), paddingBottom: sc(8),
  },
  reminderModalKicker: {
    fontFamily: fonts.sansMedium, fontSize: sc(8), letterSpacing: sc(1.8),
    color: colors.warmHint,
  },
  reminderModalTitle: {
    marginTop: sc(2), fontFamily: fonts.serifRegular, fontSize: sc(19),
    lineHeight: sc(23), color: colors.parchment,
  },
  reminderModalSummaryPill: {
    flexDirection: 'row', alignItems: 'center', gap: sc(8),
    paddingVertical: sc(8), paddingHorizontal: sc(10), marginBottom: sc(2),
    borderRadius: radius.sm, backgroundColor: 'rgba(255,255,255,.035)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,.07)',
  },
  reminderModalSummaryDot: {
    width: sc(6), height: sc(6), borderRadius: 99, backgroundColor: 'rgba(214,182,120,.55)',
  },
  reminderModalSummary: {
    flex: 1, fontFamily: fonts.sansMedium, fontSize: sc(9.5),
    lineHeight: sc(13), color: colors.creamDim,
  },
  reminderModalContent: { paddingTop: sc(8), paddingBottom: sc(8) },
  reminderEditor: { gap: sc(8) },
  reminderRuleCard: {
    padding: sc(11), borderRadius: radius.md, backgroundColor: 'rgba(255,255,255,.025)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,.065)',
  },
  reminderLabel: {
    fontFamily: fonts.sansMedium, fontSize: sc(8.5), letterSpacing: sc(1.15),
    color: colors.warmHint, marginBottom: sc(8),
  },
  reminderTimeLabel: { marginTop: sc(12) },
  dayRow: { flexDirection: 'row', gap: sc(5) },
  dayChip: {
    flex: 1, minHeight: sc(34), alignItems: 'center', justifyContent: 'center',
    borderRadius: sc(10), backgroundColor: 'rgba(255,255,255,.035)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,.075)',
  },
  dayChipOn: {
    backgroundColor: 'rgba(214,182,120,.11)', borderColor: 'rgba(214,182,120,.3)',
  },
  dayChipText: { fontFamily: fonts.sansMedium, fontSize: sc(10.5), color: colors.creamDim },
  dayChipTextOn: { color: colors.parchment },
  reminderTimes: { gap: sc(6) },
  timeRow: {
    flexDirection: 'row', alignItems: 'center', gap: sc(4), minHeight: sc(44),
    paddingHorizontal: sc(7), borderRadius: sc(11), backgroundColor: 'rgba(0,0,0,.16)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,.055)',
  },
  stepBtn: {
    width: sc(28), height: sc(28), alignItems: 'center', justifyContent: 'center',
    borderRadius: sc(9), backgroundColor: 'rgba(255,255,255,.04)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,.07)',
  },
  timeUnit: {
    minWidth: sc(24), textAlign: 'center',
    fontFamily: fonts.monoMedium, fontSize: sc(14), color: colors.parchment,
  },
  timeColon: { fontFamily: fonts.monoMedium, fontSize: sc(14), color: colors.warmHint },
  addTime: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: sc(5),
    minHeight: sc(35), marginTop: sc(7), borderRadius: sc(10),
    backgroundColor: 'rgba(255,255,255,.025)', borderWidth: 1,
    borderColor: 'rgba(255,255,255,.07)',
  },
  addTimeText: { fontFamily: fonts.sansMedium, fontSize: sc(10.5), color: colors.creamDim },
  reminderDone: {
    minHeight: sc(42), alignItems: 'center', justifyContent: 'center',
    marginTop: sc(2), borderRadius: sc(12), backgroundColor: 'rgba(214,182,120,.12)',
    borderWidth: 1, borderColor: 'rgba(214,182,120,.25)',
  },
  reminderDoneText: {
    fontFamily: fonts.sansMedium, fontSize: sc(12), color: colors.goldSoft,
  },
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
  toggle: {
    flexShrink: 0, width: sc(40), height: sc(24), borderRadius: 999, backgroundColor: 'rgba(255,255,255,.08)',
    borderWidth: 1, borderColor: 'rgba(214,182,120,.26)', padding: sc(3), justifyContent: 'center',
  },
  toggleOn: { backgroundColor: 'rgba(230,162,60,.32)', borderColor: 'rgba(230,162,60,.6)' },
  knob: { width: sc(16), height: sc(16), borderRadius: 999, backgroundColor: 'rgba(240,225,195,.55)' },
  knobOn: { alignSelf: 'flex-end', backgroundColor: colors.amberBright },
});
