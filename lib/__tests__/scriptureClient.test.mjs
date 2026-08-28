import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_RETRY_AFTER_SECONDS,
  SCRIPTURE_REQUEST_TIMEOUT_MS,
  fetchScriptureBooks,
  resolveScriptureBooksUrl,
  resolveScriptureUrl,
  selectScripture,
  selectScriptureOnce,
} from '../scriptureClient.ts';

const selection = (overrides = {}) => ({
  language: 'ru',
  canonical: {
    canonical_id: 'v3:19.023.001-006',
    book_number: 19,
    chapter_number: 23,
    verse_start: 1,
    verse_end: 6,
  },
  passage: {
    translation: 1,
    translation_alias: 'syn',
    book_number: 19,
    chapter_number: 22,
    verse_start: 1,
    verse_end: 6,
    title: null,
    text: 'Господь — Пастырь мой',
  },
  source: 'safe_pool',
  fallback_reason: 'empty_topic',
  history_reset: false,
  ...overrides,
});

const jsonResponse = (body, init = {}) =>
  new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: init.headers,
  });

const noTimeout = {
  setTimer: () => 1,
  clearTimer: () => {},
};

test('uses an explicit URL or derives scripture endpoint from the complete endpoint', () => {
  assert.equal(
    resolveScriptureUrl(
      ' https://scripture.test/custom ',
      'https://proxy.test/api/twinkler/v1/complete',
    ),
    'https://scripture.test/custom',
  );
  assert.equal(
    resolveScriptureUrl(undefined, 'http://192.168.1.2:9084/api/twinkler/v1/complete'),
    'http://192.168.1.2:9084/api/scripture/v1/select',
  );
  assert.equal(resolveScriptureUrl(undefined, 'https://proxy.test/not-complete'), null);
  assert.equal(
    resolveScriptureBooksUrl('http://192.168.1.2:9084/api/scripture/v1/select', 1),
    'http://192.168.1.2:9084/api/translations/1/books',
  );
});

test('loads and validates translation book names for exact passage references', async () => {
  let requestedUrl;
  const books = await fetchScriptureBooks(1, {
    url: 'https://proxy.test/api/scripture/v1/select',
    apiKey: 'public-key',
    fetchImpl: async (url, init) => {
      requestedUrl = url;
      assert.equal(init.headers['x-api-key'], 'public-key');
      return jsonResponse([
        { book_number: 19, name: 'Псалом', alias: 'psa', chapters_count: 150 },
      ]);
    },
  });

  assert.equal(requestedUrl, 'https://proxy.test/api/translations/1/books');
  assert.deepEqual(books, [
    { bookNumber: 19, name: 'Псалом', alias: 'psa', chaptersCount: 150 },
  ]);
});

test('book catalog fetch is bounded by the same 25 second timeout', async () => {
  let scheduled;
  const books = await fetchScriptureBooks(1, {
    url: 'https://proxy.test/api/scripture/v1/select',
    fetchImpl: async (_url, init) => await new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    }),
    setTimer: (callback, milliseconds) => {
      scheduled = milliseconds;
      queueMicrotask(callback);
      return 1;
    },
    clearTimer: () => {},
  });
  assert.equal(scheduled, 25_000);
  assert.equal(books, null);
});

test('single request sends the configured public key and accepts an unknown source', async () => {
  const calls = [];
  let timeoutMs;
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return jsonResponse(selection({ source: 'future_source', fallback_reason: undefined }));
  };

  const result = await selectScriptureOnce(
    { language: 'ru', topic: 'Надежда' },
    {
      url: 'https://proxy.test/api/scripture/v1/select',
      apiKey: 'same-public-key',
      fetchImpl,
      setTimer: (_callback, milliseconds) => {
        timeoutMs = milliseconds;
        return 1;
      },
      clearTimer: () => {},
    },
  );

  assert.equal(result.ok, true);
  assert.equal(result.data.source, 'future_source');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://proxy.test/api/scripture/v1/select');
  assert.equal(calls[0].init.headers['x-api-key'], 'same-public-key');
  assert.deepEqual(JSON.parse(calls[0].init.body), { language: 'ru', topic: 'Надежда' });
  assert.equal(timeoutMs, SCRIPTURE_REQUEST_TIMEOUT_MS);
  assert.equal(timeoutMs, 25_000);
});

test('single request accepts optional verse data, highlight and coverage fallback', async () => {
  const body = selection({
    passage: {
      ...selection().passage,
      text: 'Первый стих Второй стих',
      verses: [
        { number: 1, text: 'Первый стих', paragraph_start: true },
        { number: 2, text: 'Второй стих', paragraph_start: false },
      ],
    },
    highlight: {
      canonical: { book_number: 19, chapter_number: 23, verse_start: 1, verse_end: 1 },
      passage: { chapter_number: 22, verse_start: 2, verse_end: 2 },
    },
    source: 'safe_pool',
    fallback_reason: 'coverage_empty',
  });
  const result = await selectScriptureOnce(
    { language: 'ru' },
    {
      url: 'https://proxy.test/select',
      fetchImpl: async () => jsonResponse(body),
      ...noTimeout,
    },
  );

  assert.deepEqual(result, { ok: true, data: body });
});

test('403 and 422 are discriminated and never retried', async (t) => {
  for (const scenario of [
    { status: 403, body: { detail: 'Invalid or missing API Key' }, kind: 'unauthorized' },
    { status: 422, body: { detail: 'topic is too long' }, kind: 'validation' },
  ]) {
    await t.test(String(scenario.status), async () => {
      let calls = 0;
      const result = await selectScripture(
        { language: 'ru', topic: 'private prayer text' },
        {
          url: 'https://proxy.test/select',
          fetchImpl: async () => {
            calls++;
            return jsonResponse(scenario.body, { status: scenario.status });
          },
          sleep: async () => assert.fail('must not sleep'),
          ...noTimeout,
        },
      );
      assert.equal(result.ok, false);
      assert.equal(result.error.kind, scenario.kind);
      if (scenario.status === 422) assert.equal(result.error.detail, 'topic is too long');
      assert.equal(calls, 1);
      assert.equal(JSON.stringify(result).includes('private prayer text'), false);
    });
  }
});

test('429 reads Retry-After case-insensitively and performs one delayed retry', async () => {
  const responses = [
    jsonResponse(
      { detail: 'Scripture selection request limit exceeded' },
      { status: 429, headers: { 'ReTrY-AfTeR': '24' } },
    ),
    jsonResponse(selection()),
  ];
  const sleeps = [];
  let calls = 0;
  const result = await selectScripture(
    { language: 'ru' },
    {
      url: 'https://proxy.test/select',
      fetchImpl: async () => responses[calls++],
      sleep: async (milliseconds) => sleeps.push(milliseconds),
      ...noTimeout,
    },
  );

  assert.equal(result.ok, true);
  assert.equal(calls, 2);
  assert.deepEqual(sleeps, [24_000]);
});

test('429 uses the 30 second default and stops after the single retry', async () => {
  let calls = 0;
  const sleeps = [];
  const result = await selectScripture(
    { language: 'ru' },
    {
      url: 'https://proxy.test/select',
      fetchImpl: async () => {
        calls++;
        return jsonResponse({ detail: 'limited' }, { status: 429 });
      },
      sleep: async (milliseconds) => sleeps.push(milliseconds),
      ...noTimeout,
    },
  );

  assert.equal(result.ok, false);
  assert.equal(result.error.kind, 'rate_limited');
  assert.equal(result.error.retryAfterSeconds, DEFAULT_RETRY_AFTER_SECONDS);
  assert.equal(calls, 2);
  assert.deepEqual(sleeps, [30_000]);
});

test('503 is retried at most twice and requests remain sequential', async () => {
  let calls = 0;
  let inFlight = 0;
  let maxInFlight = 0;
  const sleeps = [];
  const result = await selectScripture(
    { language: 'ru' },
    {
      url: 'https://proxy.test/select',
      fetchImpl: async () => {
        calls++;
        inFlight++;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await Promise.resolve();
        inFlight--;
        return jsonResponse({ detail: 'unavailable' }, { status: 503 });
      },
      sleep: async (milliseconds) => sleeps.push(milliseconds),
      ...noTimeout,
    },
  );

  assert.equal(result.ok, false);
  assert.equal(result.error.kind, 'unavailable');
  assert.equal(calls, 3);
  assert.equal(maxInFlight, 1);
  assert.deepEqual(sleeps, [2000, 6000]);
});

test('network failure gets one retry without exposing the request body', async () => {
  let calls = 0;
  const originalError = console.error;
  const logged = [];
  console.error = (...values) => logged.push(values);
  try {
    const result = await selectScripture(
      { language: 'ru', topic: 'private prayer text' },
      {
        url: 'https://proxy.test/select',
        fetchImpl: async () => {
          calls++;
          throw new Error('socket closed');
        },
        sleep: async () => assert.fail('network retry is immediate'),
        ...noTimeout,
      },
    );
    assert.equal(result.ok, false);
    assert.equal(result.error.kind, 'network');
    assert.equal(calls, 2);
    assert.deepEqual(logged, []);
    assert.equal(JSON.stringify(result).includes('private prayer text'), false);
  } finally {
    console.error = originalError;
  }
});

test('timeout aborts at 25 seconds and gets one retry without real waiting', async () => {
  let calls = 0;
  const scheduled = [];
  const result = await selectScripture(
    { language: 'ru' },
    {
      url: 'https://proxy.test/select',
      fetchImpl: async (_url, init) => {
        calls++;
        return await new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'));
          });
        });
      },
      setTimer: (callback, milliseconds) => {
        scheduled.push(milliseconds);
        queueMicrotask(callback);
        return scheduled.length;
      },
      clearTimer: () => {},
      sleep: async () => assert.fail('timeout retry is immediate'),
    },
  );

  assert.equal(result.ok, false);
  assert.equal(result.error.kind, 'timeout');
  assert.equal(calls, 2);
  assert.deepEqual(scheduled, [25_000, 25_000]);
});

test('malformed success response is rejected without retry', async () => {
  let calls = 0;
  const result = await selectScripture(
    { language: 'ru' },
    {
      url: 'https://proxy.test/select',
      fetchImpl: async () => {
        calls++;
        return new Response('{', { status: 200 });
      },
      sleep: async () => assert.fail('must not retry'),
      ...noTimeout,
    },
  );
  assert.equal(result.ok, false);
  assert.equal(result.error.kind, 'invalid_response');
  assert.equal(calls, 1);
});

test('external session cancellation aborts transport and suppresses further retries', async () => {
  const controller = new AbortController();
  let calls = 0;
  const resultPromise = selectScripture(
    { language: 'ru' },
    {
      url: 'https://proxy.test/select',
      signal: controller.signal,
      fetchImpl: async (_url, init) => {
        calls++;
        return await new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
        });
      },
      ...noTimeout,
    },
  );
  controller.abort();
  const result = await resultPromise;
  assert.equal(result.ok, false);
  assert.equal(result.error.kind, 'cancelled');
  assert.equal(calls, 1);
});
