import assert from 'node:assert/strict';
import test from 'node:test';
import { checkVersion, parseVersionCheck } from '../versionCheck.ts';
const storeUrls = { ios: 'https://apps.apple.com/app/id6806024678', android: 'https://play.google.com/store/apps/details?id=com.nf404.twinkler' };
const response = (type, platform = 'ios') => ({ app: 'lampada', platform, update_type: type, latest_version: '1.1.0', store_url: storeUrls[platform], message: {ru: 'Обнови приложение', en: 'Update', uk: 'Онови'} });
const rejected = (reason, status) => (status === undefined ? { ok: false, reason } : { ok: false, reason, status });
const endpoint = 'https://example.test/api/version-check';

test('accepts update decisions and rejects unsafe blocking responses', () => {
  for (const type of ['none', 'soft', 'hard']) assert.equal(parseVersionCheck(response(type), 'ios').check.update_type, type);
  assert.deepEqual(parseVersionCheck({...response('hard'), store_url: 'javascript:alert(1)'}, 'ios'), rejected('invalid'));
  assert.deepEqual(parseVersionCheck({...response('hard'), message: null}, 'ios'), rejected('invalid'));
  assert.deepEqual(parseVersionCheck(response('unknown'), 'ios'), rejected('invalid'));
  assert.deepEqual(parseVersionCheck(null, 'ios'), rejected('invalid'));
  assert.deepEqual(parseVersionCheck({...response('hard'), app: undefined}, 'ios'), rejected('app-mismatch'));
  assert.deepEqual(parseVersionCheck({...response('hard'), app: 'bible-garden'}, 'ios'), rejected('app-mismatch'));
});

test('accepts only a decision made for the installed platform', () => {
  assert.equal(parseVersionCheck(response('hard', 'android'), 'android').check.store_url, storeUrls.android);
  // Сервер без платформы отдаёт ссылку App Store — Android её не показывает.
  const { platform: _, ...legacy } = response('hard');
  assert.deepEqual(parseVersionCheck(legacy, 'android'), rejected('platform-mismatch'));
  assert.deepEqual(parseVersionCheck(legacy, 'ios'), rejected('platform-mismatch'));
  assert.deepEqual(parseVersionCheck(response('hard', 'ios'), 'android'), rejected('platform-mismatch'));
  assert.deepEqual(parseVersionCheck(response('hard', 'android'), 'ios'), rejected('platform-mismatch'));
});

test('sends app, installed version and platform and reports why a check is ignored', async (t) => {
  let requested;
  let reply = async () => ({ ok: true, json: async () => response('soft', 'android') });
  t.mock.method(globalThis, 'fetch', async (url, options) => { requested = {url, options}; return reply(); });
  const signal = new AbortController().signal;
  assert.equal((await checkVersion(endpoint, '1.0.0', 'android', 'test-key', signal)).check.update_type, 'soft');
  const params = new URL(requested.url).searchParams;
  assert.equal(params.get('app'), 'lampada');
  assert.equal(params.get('app_version'), '1.0.0');
  assert.equal(params.get('platform'), 'android');
  assert.equal(requested.options.headers['x-api-key'], 'test-key');
  assert.deepEqual(await checkVersion(endpoint, '1.0.0', 'ios', 'test-key', signal), rejected('platform-mismatch'));
  assert.equal(new URL(requested.url).searchParams.get('platform'), 'ios');
  reply = async () => ({ ok: false, status: 503, json: async () => ({}) });
  assert.deepEqual(await checkVersion(endpoint, '1.0', 'ios', undefined, signal), rejected('status', 503));
  reply = async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('html'); } });
  assert.deepEqual(await checkVersion(endpoint, '1.0', 'ios', undefined, signal), rejected('invalid', 200));
  reply = async () => { throw new Error('offline'); };
  assert.deepEqual(await checkVersion(endpoint, '1.0', 'ios', undefined, signal), rejected('network'));
  assert.deepEqual(await checkVersion(null, '1.0', 'ios', undefined, signal), rejected('unconfigured'));
});
