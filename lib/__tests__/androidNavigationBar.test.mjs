import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const config = require('../../app.json').expo;
const { applyStartupStyle, navigationBarOptions } = require('../../plugins/withAndroidSystemBars.js');

test('Android system contrast is enabled with light navigation buttons in the effective Expo config', () => {
  const navigationBar = config.plugins.find((plugin) =>
    Array.isArray(plugin) && plugin[0] === 'expo-navigation-bar');

  assert.deepEqual(navigationBar?.[1], { enforceContrast: true, style: 'light' });
});

test('cold-start native style follows the single navigation-bar config and survives repeated prebuilds', () => {
  const source = 'class MainActivity {\n  override fun onCreate() {\n    super.onCreate(null)\n  }\n}';
  const light = applyStartupStyle(source, navigationBarOptions(config).style);
  assert.match(light, /super\.onCreate\(null\)[\s\S]*isAppearanceLightNavigationBars = false/);
  assert.equal(applyStartupStyle(light, 'light'), light);
  assert.match(applyStartupStyle(light, 'dark'), /isAppearanceLightNavigationBars = true/);
});
