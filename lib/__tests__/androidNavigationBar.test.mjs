import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const config = require('../../app.json').expo;
const { applySplashStyles, applyStartupStyle, navigationBarOptions } =
  require('../../plugins/withAndroidSystemBars.js');

test('Android system contrast is enabled with light navigation buttons in the effective Expo config', () => {
  const navigationBar = config.plugins.find((plugin) =>
    Array.isArray(plugin) && plugin[0] === 'expo-navigation-bar');

  assert.deepEqual(navigationBar?.[1], { enforceContrast: true, style: 'light' });
});

test('cold-start native style follows the single navigation-bar config and survives repeated prebuilds', () => {
  const source = 'class MainActivity {\n  override fun onCreate() {\n    super.onCreate(null)\n  }\n}';
  const light = applyStartupStyle(source, navigationBarOptions(config).style);
  assert.match(light, /super\.onCreate\(null\)[\s\S]*isAppearanceLightNavigationBars = false/);
  assert.match(light, /SDK_INT < android\.os\.Build\.VERSION_CODES\.Q[\s\S]*Color\.argb\(0x80, 0x1b, 0x1b, 0x1b\)/);
  assert.equal(applyStartupStyle(light, 'light'), light);
  assert.match(applyStartupStyle(light, 'dark'), /isAppearanceLightNavigationBars = true/);
  assert.throws(() => applyStartupStyle('class MainActivity {}', 'light'), /exactly one super\.onCreate/);
  assert.throws(() => applyStartupStyle(light.replace('END lampada', 'BROKEN lampada'), 'light'), /markers are malformed/);
});

test('splash theme marks API-specific items for Android lint', () => {
  const styles = applySplashStyles({ resources: { style: [
    { $: { name: 'Theme.App.SplashScreen' }, item: [] },
  ] } }, navigationBarOptions(config));
  const items = styles.resources.style[0].item;
  assert.equal(styles.resources.$['xmlns:tools'], 'http://schemas.android.com/tools');
  assert.equal(items.find((item) => item.$.name === 'android:windowLightNavigationBar').$['tools:targetApi'], '27');
  assert.equal(items.find((item) => item.$.name === 'android:enforceNavigationBarContrast').$['tools:targetApi'], '29');
});
