import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { allowsCleartextApi } = require('../../plugins/withAndroidBuild.js');

test('Android test builds can use the local HTTP API', () => {
  assert.equal(allowsCleartextApi({
    EXPO_PUBLIC_API_URL: 'http://192.168.127.133:9084',
    EXPO_PUBLIC_BUILD_CHANNEL: 'test',
  }), true);
});

test('HTTPS builds keep cleartext traffic disabled', () => {
  for (const channel of ['test', 'store', undefined]) {
    assert.equal(allowsCleartextApi({
      EXPO_PUBLIC_API_URL: 'https://api.example.com',
      EXPO_PUBLIC_BUILD_CHANNEL: channel,
    }), false);
  }
});

test('HTTP without an explicit test channel cannot enter a store build', () => {
  for (const channel of ['store', undefined]) {
    assert.throws(() => allowsCleartextApi({
      EXPO_PUBLIC_API_URL: 'http://192.168.127.133:9084',
      EXPO_PUBLIC_BUILD_CHANNEL: channel,
    }), /only for test builds/);
  }
});

test('missing or malformed API origins stop Android configuration', () => {
  for (const origin of [undefined, '', 'not a url', 'ftp://api.example.com',
    'https://user:pass@api.example.com', 'https://api.example.com/api',
    'https://api.example.com?token=secret', 'https://api.example.com#fragment']) {
    assert.throws(() => allowsCleartextApi({
      EXPO_PUBLIC_API_URL: origin,
      EXPO_PUBLIC_BUILD_CHANNEL: 'test',
    }));
  }
});
