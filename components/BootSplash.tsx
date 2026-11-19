import { useEffect, useRef } from 'react';
import { Animated, Image, StyleSheet } from 'react-native';

// A copy of the native splash from the expo-splash-screen plugin in app.json:
// the same background and a 200×200 flame centered in the window. The native
// splash is removed as soon as the copy's flame is ready to draw, not after
// the app loads: on Android 12+ the app gets 2 s after the first frame to
// take over the system splash, and a heavy first frame with the whole UI under
// load did not make it (ADR-0040). The SplashScreen.hide() call itself is in
// the root layout: on this same signal it allows the app to mount.

const FADE_MS = 350;

type Props = {
  /** The flame is ready to draw (or failed to load): the native splash can be removed. */
  onFlameLoaded: () => void;
  /** The app is ready: the copy fades out smoothly, revealing it. */
  done: boolean;
  /** The copy is fully transparent and can be unmounted. */
  onHidden: () => void;
};

export default function BootSplash({ onFlameLoaded, done, onHidden }: Props) {
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!done) return;
    // An interrupted fade also removes the copy: otherwise it would stay over
    // the app forever.
    Animated.timing(opacity, { toValue: 0, duration: FADE_MS, useNativeDriver: true }).start(
      onHidden,
    );
  }, [done, opacity, onHidden]);

  return (
    <Animated.View style={[styles.root, { opacity }]}>
      {/* onLoadEnd fires on load failure too: the native splash never hangs
          in any outcome. */}
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
