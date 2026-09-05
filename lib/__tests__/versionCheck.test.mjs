import assert from 'node:assert/strict';
import test from 'node:test';
import { checkVersion, parseVersionCheck } from '../versionCheck.ts';
const response = (type) => ({ app: 'lampada', update_type: type, latest_version: '1.1.0', store_url: 'https://apps.apple.com/app/id6806024678', message: {ru: 'Обнови приложение', en: 'Update', uk: 'Онови'} });
test('accepts update decisions and rejects unsafe blocking responses', () => {
  for (const type of ['none', 'soft', 'hard']) assert.equal(parseVersionCheck(response(type)).update_type, type);
  assert.equal(parseVersionCheck({...response('hard'), store_url: 'javascript:alert(1)'}), null);
  assert.equal(parseVersionCheck({...response('hard'), message: null}), null);
  assert.equal(parseVersionCheck(response('unknown')), null);
  assert.equal(parseVersionCheck({...response('hard'), app: undefined}), null);
  assert.equal(parseVersionCheck({...response('hard'), app: 'bible-garden'}), null);
});
test('sends app and installed version and fails open on network errors', async (t) => {
  let requested;
  t.mock.method(globalThis, 'fetch', async (url, options) => { requested = {url, options}; return {ok:true, json:async()=>response('soft')}; });
  const signal = new AbortController().signal;
  assert.equal((await checkVersion('https://example.test/api/version-check', '1.0.0', 'test-key', signal)).update_type, 'soft');
  assert.equal(new URL(requested.url).searchParams.get('app'), 'lampada');
  assert.equal(new URL(requested.url).searchParams.get('app_version'), '1.0.0');
  assert.equal(requested.options.headers['x-api-key'], 'test-key');
  globalThis.fetch.mock.mockImplementation(async () => { throw new Error('offline'); });
  assert.equal(await checkVersion('https://example.test/api/version-check', '1.0', undefined, signal), null);
});
