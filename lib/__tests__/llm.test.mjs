import assert from 'node:assert/strict';
import test from 'node:test';

test('AI proxy request sends only the user field', async () => {
  process.env.EXPO_PUBLIC_AI_PROXY_URL = 'https://proxy.test/api/ai/question';
  process.env.EXPO_PUBLIC_AI_PROXY_KEY = 'public-proxy-key';

  const originalFetch = globalThis.fetch;
  let capturedRequest;
  globalThis.fetch = async (url, options) => {
    capturedRequest = { url, options };
    return {
      ok: true,
      json: async () => ({ text: 'Ответ' }),
    };
  };

  try {
    const { complete } = await import('../llm.ts?wire-contract');
    assert.equal(await complete('Запрос'), 'Ответ');
    assert.equal(capturedRequest.url, 'https://proxy.test/api/ai/question');
    assert.equal(capturedRequest.options.headers['x-api-key'], 'public-proxy-key');
    assert.deepEqual(JSON.parse(capturedRequest.options.body), { user: 'Запрос' });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
