import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const configure = require('../../app.config.js');
const staticConfig = require('../../app.json').expo;

test('Android system contrast is enabled with light navigation buttons in the effective Expo config', () => {
  const config = configure({ config: staticConfig });
  const navigationBar = config.plugins.find((plugin) =>
    Array.isArray(plugin) && plugin[0] === 'expo-navigation-bar');

  assert.deepEqual(navigationBar?.[1], { enforceContrast: true, style: 'light' });
  assert.equal(config.plugins.length, staticConfig.plugins.length);
});
