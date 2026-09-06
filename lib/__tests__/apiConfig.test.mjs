import assert from 'node:assert/strict';
import test from 'node:test';
import { apiBaseUrl, apiPaths, resolveApiUrl } from '../apiConfig.ts';

test('all endpoints share one origin, with or without its trailing slash', () => {
  const paths = [
    [apiPaths.question, '/api/ai/question'],
    [apiPaths.transcription, '/api/ai/transcribe'],
    [apiPaths.scripture, '/api/ai/scripture'],
    [apiPaths.languages, '/api/languages'],
    [apiPaths.translations, '/api/translations'],
    [apiPaths.books(7), '/api/translations/7/books'],
    [apiPaths.excerpt, '/api/excerpt_with_alignment'],
    [apiPaths.about, '/api/about'],
    [apiPaths.versionCheck, '/api/version-check'],
  ];
  for (const base of ['https://api.test', ' https://api.test/ ']) {
    for (const [path, expected] of paths) {
      assert.equal(resolveApiUrl(path, base), `https://api.test${expected}`);
    }
  }
  assert.equal(resolveApiUrl(apiPaths.transcription, 'http://127.0.0.1:9084/'),
    'http://127.0.0.1:9084/api/ai/transcribe');
});

test('missing or invalid origins cannot route requests or expose URL credentials', () => {
  for (const base of ['', ' ', 'not a url', 'file:///tmp/api',
    'https://api.test/api/ai/question', 'https://user:secret@api.test',
    'https://api.test?api_key=secret', 'https://api.test#fragment']) {
    assert.equal(apiBaseUrl(base), null);
    assert.equal(resolveApiUrl(apiPaths.question, base), null);
  }
  for (const path of ['https://elsewhere.test', '//elsewhere.test', '/\\elsewhere.test']) {
    assert.equal(resolveApiUrl(path, 'https://api.test'), null);
  }
});

test('runtime uses only EXPO_PUBLIC_API_URL and ignores legacy endpoint variables', () => {
  const names = ['EXPO_PUBLIC_API_URL', 'EXPO_PUBLIC_AI_PROXY_URL',
    'EXPO_PUBLIC_AI_TRANSCRIBE_URL', 'EXPO_PUBLIC_SCRIPTURE_SELECT_URL'];
  const previous = names.map(name => process.env[name]);
  try {
    for (const name of names) process.env[name] = 'https://legacy.test/api/ai/question';
    delete process.env.EXPO_PUBLIC_API_URL;
    assert.equal(resolveApiUrl(apiPaths.question), null);
    process.env.EXPO_PUBLIC_API_URL = 'https://current.test/';
    assert.equal(apiBaseUrl(), 'https://current.test');
    assert.equal(resolveApiUrl(apiPaths.question), 'https://current.test/api/ai/question');
  } finally {
    names.forEach((name, index) => {
      if (previous[index] === undefined) delete process.env[name];
      else process.env[name] = previous[index];
    });
  }
});
