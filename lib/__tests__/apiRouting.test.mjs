import assert from 'node:assert/strict';
import test from 'node:test';

test('catalogs, selection, contacts and audio use the configured origin and client key', async (t) => {
  const previousUrl = process.env.EXPO_PUBLIC_API_URL;
  const previousKey = process.env.EXPO_PUBLIC_AI_PROXY_KEY;
  const previousFetch = globalThis.fetch;
  process.env.EXPO_PUBLIC_API_URL = 'http://127.0.0.1:9084/';
  process.env.EXPO_PUBLIC_AI_PROXY_KEY = 'test-client-key';
  t.after(() => {
    globalThis.fetch = previousFetch;
    if (previousUrl === undefined) delete process.env.EXPO_PUBLIC_API_URL;
    else process.env.EXPO_PUBLIC_API_URL = previousUrl;
    if (previousKey === undefined) delete process.env.EXPO_PUBLIC_AI_PROXY_KEY;
    else process.env.EXPO_PUBLIC_AI_PROXY_KEY = previousKey;
  });

  const { fetchScriptureLanguages, fetchScriptureTranslations } = await import('../scriptureCatalogClient.ts');
  const { fetchScriptureBooks, selectScriptureOnce } = await import('../scriptureClient.ts');
  const { fetchAboutContacts } = await import('../aboutClient.ts');
  const { fetchScriptureAudioClip } = await import('../scriptureAudioClient.ts');
  const calls = [];
  globalThis.fetch = async (raw, options) => {
    const url = new URL(raw);
    assert.equal(url.origin, 'http://127.0.0.1:9084');
    assert.equal(options.headers['x-api-key'], 'test-client-key');
    calls.push({ url, options });
    let body = [];
    if (url.pathname === '/api/translations/1/books') {
      body = [{ book_number: 19, name: 'Psalms', alias: 'psa', chapters_count: 150 }];
    } else if (url.pathname === '/api/about') {
      body = { contacts: [] };
    } else if (url.pathname === '/api/excerpt_with_alignment') {
      body = { parts: [{ audio_link: 'http://internal.test/audio/psa.mp3?part=1',
        verses: [{ number: 1, begin: 2, end: 5 }] }] };
    }
    return new Response(JSON.stringify(body), { status: 200 });
  };

  await fetchScriptureLanguages();
  await fetchScriptureTranslations('en');
  await fetchScriptureBooks(1);
  await selectScriptureOnce({ language: 'en', topic: '', history: [] });
  await fetchAboutContacts(new AbortController().signal, 'en');
  const clip = await fetchScriptureAudioClip({ selection: { passage: {
    translation: 1, book_number: 19, chapter_number: 23, verse_start: 1, verse_end: 1,
  } } }, 7);

  assert.deepEqual(calls.map(call => call.url.pathname), [
    '/api/languages', '/api/translations', '/api/translations/1/books',
    '/api/ai/scripture', '/api/about', '/api/translations/1/books', '/api/excerpt_with_alignment',
  ]);
  assert.equal(calls[1].url.searchParams.get('language'), 'en');
  assert.equal(calls[3].options.method, 'POST');
  assert.equal(calls[4].url.searchParams.get('app'), 'lampada');
  assert.equal(calls[5].url.searchParams.get('voice_code'), '7');
  assert.equal(calls[6].url.searchParams.get('excerpt'), 'psa 23:1-1');
  const audio = new URL(clip.url);
  assert.equal(audio.origin, 'http://127.0.0.1:9084');
  assert.equal(audio.pathname, '/audio/psa.mp3');
  assert.equal(audio.searchParams.get('part'), '1');
  assert.equal(audio.searchParams.get('api_key'), 'test-client-key');
});
