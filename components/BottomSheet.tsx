import React, { useEffect } from 'react';
import { BackHandler, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IconButton } from './ui';
import { Close } from './icons';
import { colors, fonts, radius, sc, useStyles } from '../lib/theme';

/**
 * Нижняя шторка поверх экрана, а не системный Modal: иначе окно закрыло бы
 * собой шторку приватности и экран блокировки при сворачивании приложения.
 * Родитель сам решает, когда её рисовать; пока она открыта, аппаратная кнопка
 * «назад» на Android закрывает шторку, а не уводит с экрана.
 */
export default function BottomSheet({
  kicker,
  title,
  summary,
  closeLabel,
  doneLabel,
  doneTestID,
  headerAction,
  testID,
  onClose,
  children,
}: {
  kicker?: string;
  title: string;
  summary?: string;
  closeLabel: string;
  doneLabel?: string;
  doneTestID?: string;
  headerAction?: React.ReactNode;
  testID?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const styles = useStyles(stylesFactory);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => subscription.remove();
  }, [onClose]);

  return (
    <View style={styles.backdrop} accessibilityViewIsModal>
      <Pressable accessibilityLabel={closeLabel} style={StyleSheet.absoluteFill} onPress={onClose} />
      <View
        testID={testID}
        style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, sc(14)) }]}
      >
        <View style={styles.handle} />
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            {kicker ? <Text style={styles.kicker}>{kicker}</Text> : null}
            <Text style={styles.title}>{title}</Text>
          </View>
          {headerAction}
          <IconButton accessibilityLabel={closeLabel} onPress={onClose}>
            <Close size={sc(14)} />
          </IconButton>
        </View>

        {summary ? (
          <View style={styles.summaryPill}>
            <View style={styles.summaryDot} />
            <Text style={styles.summary}>{summary}</Text>
          </View>
        ) : null}

        <ScrollView bounces={false} contentContainerStyle={styles.content}>
          {children}
        </ScrollView>

        {doneLabel ? (
          <Pressable
            accessibilityRole="button"
            testID={doneTestID}
            onPress={onClose}
            style={({ pressed }) => [styles.done, pressed && styles.pressed]}
          >
            <Text style={styles.doneText}>{doneLabel}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const stylesFactory = () => StyleSheet.create({
  backdrop: {
    position: 'absolute', top: 0, right: 0, bottom: 0, left: 0,
    justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,.78)',
  },
  sheet: {
    maxHeight: '82%', paddingTop: sc(7), paddingHorizontal: sc(14),
    backgroundColor: '#171109', borderTopLeftRadius: sc(22), borderTopRightRadius: sc(22),
    borderWidth: 1, borderBottomWidth: 0, borderColor: 'rgba(214,182,120,.2)',
    shadowColor: '#000', shadowOffset: { width: 0, height: -8 }, shadowOpacity: 0.42,
    shadowRadius: sc(18), elevation: 20,
  },
  handle: {
    alignSelf: 'center', width: sc(34), height: sc(3), borderRadius: 99,
    marginBottom: sc(8), backgroundColor: 'rgba(255,255,255,.16)',
  },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: sc(10), paddingBottom: sc(8),
  },
  kicker: {
    fontFamily: fonts.sansMedium, fontSize: sc(8), letterSpacing: sc(1.8),
    color: colors.warmHint,
  },
  title: {
    marginTop: sc(2), fontFamily: fonts.serifRegular, fontSize: sc(19),
    lineHeight: sc(23), color: colors.parchment,
  },
  summaryPill: {
    flexDirection: 'row', alignItems: 'center', gap: sc(8),
    paddingVertical: sc(8), paddingHorizontal: sc(10), marginBottom: sc(2),
    borderRadius: radius.sm, backgroundColor: 'rgba(255,255,255,.035)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,.07)',
  },
  summaryDot: {
    width: sc(6), height: sc(6), borderRadius: 99, backgroundColor: 'rgba(214,182,120,.55)',
  },
  summary: {
    flex: 1, fontFamily: fonts.sansMedium, fontSize: sc(9.5),
    lineHeight: sc(13), color: colors.creamDim,
  },
  content: { paddingTop: sc(8), paddingBottom: sc(8) },
  done: {
    minHeight: sc(42), alignItems: 'center', justifyContent: 'center',
    marginTop: sc(2), borderRadius: sc(12), backgroundColor: 'rgba(214,182,120,.12)',
    borderWidth: 1, borderColor: 'rgba(214,182,120,.25)',
  },
  doneText: {
    fontFamily: fonts.sansMedium, fontSize: sc(12), color: colors.goldSoft,
  },
  pressed: { opacity: 0.62 },
});
