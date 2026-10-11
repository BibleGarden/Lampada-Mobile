import { useEffect, useRef } from 'react';
import { Animated, Image, StyleSheet } from 'react-native';

// Копия нативного сплэша из плагина expo-splash-screen в app.json: тот же фон
// и пламя 200×200 в центре окна. Нативный сплэш снимается, как только пламя
// копии готово к отрисовке, а не после загрузки приложения: Android 12+ после
// первого кадра даёт приложению 2 с на приём системного сплэша, и тяжёлый
// первый кадр со всем интерфейсом под нагрузкой не успевал (ADR-0040).
// Сам вызов SplashScreen.hide() — в корневом layout: он же по этому сигналу
// разрешает монтировать приложение.

const FADE_MS = 350;

type Props = {
  /** Пламя готово к отрисовке (или не загрузилось): нативный сплэш можно снять. */
  onFlameLoaded: () => void;
  /** Приложение готово: копия плавно уходит, открывая его. */
  done: boolean;
  /** Копия полностью прозрачна, её можно размонтировать. */
  onHidden: () => void;
};

export default function BootSplash({ onFlameLoaded, done, onHidden }: Props) {
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!done) return;
    // Прерванное затухание тоже убирает копию: иначе она осталась бы поверх
    // приложения навсегда.
    Animated.timing(opacity, { toValue: 0, duration: FADE_MS, useNativeDriver: true }).start(
      onHidden,
    );
  }, [done, opacity, onHidden]);

  return (
    <Animated.View style={[styles.root, { opacity }]}>
      {/* onLoadEnd приходит и при ошибке загрузки: нативный сплэш не
          зависает ни в каком исходе. */}
      <Image
        source={require('../assets/splash.png')}
        style={styles.flame}
        onLoadEnd={onFlameLoaded}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0e0a07',
  },
  flame: { width: 200, height: 200 },
});
