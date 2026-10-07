import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { validateInstalledAndroid } from '../../scripts/validate-installed-android.mjs';

const require = createRequire(import.meta.url);
const { runtimeMetadata, runtimeMetadataNames } = require('../../plugins/withAndroidBuild.js');
const testOrigin = 'http://192.0.2.10:9084';

const manifest = (channel, apiOrigin) => ({ manifest: {
  application: [{ $: { 'android:name': '.MainApplication' }, 'meta-data': [
    { $: { 'android:name': runtimeMetadataNames.channel, 'android:value': channel } },
    { $: { 'android:name': runtimeMetadataNames.apiOrigin, 'android:value': apiOrigin } },
  ] }],
} });

test('runtime metadata records the explicit build channel and normalized API origin, without a key', () => {
  assert.deepEqual(runtimeMetadata({
    EXPO_PUBLIC_BUILD_CHANNEL: 'test', EXPO_PUBLIC_API_URL: testOrigin + '/',
    EXPO_PUBLIC_AI_PROXY_KEY: 'not-part-of-metadata',
  }), { channel: 'test', apiOrigin: testOrigin });
  assert.throws(() => runtimeMetadata({ EXPO_PUBLIC_API_URL: testOrigin }), /BUILD_CHANNEL/);
});

test('installed test APK must match the expected test API', () => {
  assert.doesNotThrow(() => validateInstalledAndroid(manifest('test', testOrigin), {
    EXPO_PUBLIC_API_URL: testOrigin + '/',
  }));
});

test('a non-debuggable store release is rejected independently of local test configuration', () => {
  assert.throws(() => validateInstalledAndroid(manifest('store', testOrigin), {
    EXPO_PUBLIC_API_URL: testOrigin,
  }), /not a test build/);
});

test('old APKs without metadata and duplicate metadata are rejected', () => {
  const old = manifest('test', testOrigin);
  delete old.manifest.application[0]['meta-data'];
  assert.throws(() => validateInstalledAndroid(old, { EXPO_PUBLIC_API_URL: testOrigin }), /missing/);
  const duplicate = manifest('test', testOrigin);
  duplicate.manifest.application[0]['meta-data'].push(duplicate.manifest.application[0]['meta-data'][0]);
  assert.throws(() => validateInstalledAndroid(duplicate, { EXPO_PUBLIC_API_URL: testOrigin }), /ambiguous/);
});

test('a stale test build using another API is rejected', () => {
  assert.throws(() => validateInstalledAndroid(manifest('test', 'https://old-test.example.com'), {
    EXPO_PUBLIC_API_URL: testOrigin,
  }), /differs/);
});

test('production API is rejected even when both local configuration and test-labelled APK target it', () => {
  for (const production of ['https://api.bible.garden', 'http://api.bible.garden', 'https://api.bible.garden:8443']) {
    assert.throws(() => validateInstalledAndroid(manifest('test', production), {
      EXPO_PUBLIC_API_URL: production,
    }), /production API/);
  }
});
