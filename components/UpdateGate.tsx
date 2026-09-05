import React, { useEffect, useState } from 'react';
import { BackHandler, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Application from 'expo-application';
import * as Linking from 'expo-linking';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { checkVersion, type VersionCheck } from '../lib/versionCheck';
import { resolveScriptureCatalogUrl } from '../lib/scriptureCatalogClient';
import { colors, fonts, radius, sc, useStyles } from '../lib/theme';

export default function UpdateGate({ covered, onVisibleChange }: {
  covered: boolean; onVisibleChange: (visible: boolean) => void;
}) {
  const styles = useStyles(stylesFactory);
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<VersionCheck | null>(null);
  const [linkFailed, setLinkFailed] = useState(false);
  const visible = data !== null && data.update_type !== 'none';
  useEffect(() => {
    const controller = new AbortController();
    const version = Application.nativeApplicationVersion;
    if (version) void checkVersion(resolveScriptureCatalogUrl('/api/version-check'), version,
      process.env.EXPO_PUBLIC_AI_PROXY_KEY, controller.signal).then((result) => {
      if (!controller.signal.aborted) setData(result);
    });
    return () => controller.abort();
  }, []);
  useEffect(() => { onVisibleChange(visible); }, [visible, onVisibleChange]);
  useEffect(() => {
    if (!visible || covered) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => subscription.remove();
  }, [visible, covered]);
  if (!visible || covered || !data) return null;
  return (
    <View style={[styles.overlay, { paddingTop: insets.top + sc(24), paddingBottom: insets.bottom + sc(24) }]}
      accessibilityViewIsModal testID={`update-${data.update_type}`}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>{data.update_type === 'hard' ? 'Обнови Лампаду' : 'Доступно обновление'}</Text>
        <Text style={styles.body}>{data.message?.ru}</Text>
        <Pressable accessibilityRole="button" testID="update-open" style={styles.button}
          onPress={() => { setLinkFailed(false); void Linking.openURL(data.store_url).catch(() => setLinkFailed(true)); }}>
          <Text style={styles.buttonText}>Обновить</Text>
        </Pressable>
        {linkFailed ? <Text style={styles.body}>Не удалось открыть ссылку. Попробуй ещё раз.</Text> : null}
        {data.update_type === 'soft' ? (
          <Pressable accessibilityRole="button" testID="update-later" style={styles.button} onPress={() => setData(null)}>
            <Text style={styles.buttonText}>Позже</Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </View>
  );
}
const stylesFactory = () => StyleSheet.create({
  overlay: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: '#080604', paddingHorizontal: sc(24) },
  content: { flexGrow: 1, justifyContent: 'center', gap: sc(16), maxWidth: sc(440), width: '100%', alignSelf: 'center' },
  title: { fontFamily: fonts.serifSemiBold, fontSize: sc(28), color: colors.parchment, textAlign: 'center' },
  body: { fontFamily: fonts.sans, fontSize: sc(13), lineHeight: sc(20), color: colors.creamDim, textAlign: 'center' },
  button: { minHeight: sc(44), justifyContent: 'center', alignItems: 'center', borderRadius: radius.md, borderWidth: 1, borderColor: colors.labelGold },
  buttonText: { fontFamily: fonts.sansMedium, fontSize: sc(14), color: colors.parchment },
});
