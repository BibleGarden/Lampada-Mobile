import assert from 'node:assert/strict';
import test from 'node:test';
import { checkVersion, parseVersionCheck } from '../versionCheck.ts';
const storeUrls = { ios: 'https://apps.apple.com/app/id6806024678', android: 'https://play.google.com/store/apps/details?id=com.nf404.twinkler' };
const response = (type, platform = 'ios') => ({ app: 'lampada', platform, update_type: type, latest_version: '1.1.0', store_url: storeUrls[platform], message: {ru: 'Обнови приложение', en: 'Update', uk: 'Онови'} });
test('accepts update decisions and rejects unsafe blocking responses', () => {
  for (const type of ['none', 'soft', 'hard']) assert.equal(parseVersionCheck(response(type), 'ios').update_type, type);
  assert.equal(parseVersionCheck({...response('hard'), store_url: 'javascript:alert(1)'}, 'ios'), null);
  assert.equal(parseVersionCheck({...response('hard'), message: null}, 'ios'), null);
  assert.equal(parseVersionCheck(response('unknown'), 'ios'), null);
  assert.equal(parseVersionCheck({...response('hard'), app: undefined}, 'ios'), null);
  assert.equal(parseVersionCheck({...response('hard'), app: 'bible-garden'}, 'ios'), null);
});
test('accepts only a decision made for the installed platform', () => {
  assert.equal(parseVersionCheck(response('hard', 'android'), 'android').store_url, storeUrls.android);
  // Сервер без платформы отдаёт ссылку App Store — Android её не показывает.
  const { platform: _, ...legacy } = response('hard');
  assert.equal(parseVersionCheck(legacy, 'android'), null);
  assert.equal(parseVersionCheck(legacy, 'ios'), null);
  assert.equal(parseVersionCheck(response('hard', 'ios'), 'android'), null);
  assert.equal(parseVersionCheck(response('hard', 'android'), 'ios'), null);
});
test('sends app, installed version and platform and fails open on network errors', async (t) => {
  let requested;
  t.mock.method(globalThis, 'fetch', async (url, options) => { requested = {url, options}; return {ok:true, json:async()=>response('soft', 'android')}; });
  const signal = new AbortController().signal;
  assert.equal((await checkVersion('https://example.test/api/version-check', '1.0.0', 'android', 'test-key', signal)).update_type, 'soft');
  const params = new URL(requested.url).searchParams;
  assert.equal(params.get('app'), 'lampada');
  assert.equal(params.get('app_version'), '1.0.0');
  assert.equal(params.get('platform'), 'android');
  assert.equal(requested.options.headers['x-api-key'], 'test-key');
  assert.equal(await checkVersion('https://example.test/api/version-check', '1.0.0', 'ios', 'test-key', signal), null);
  assert.equal(new URL(requested.url).searchParams.get('platform'), 'ios');
  globalThis.fetch.mock.mockImplementation(async () => { throw new Error('offline'); });
  assert.equal(await checkVersion('https://example.test/api/version-check', '1.0', 'ios', undefined, signal), null);
});
