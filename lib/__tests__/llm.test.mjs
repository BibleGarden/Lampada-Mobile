import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';

const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === './questionRequest') {
      return { url: new URL('../questionRequest.ts', import.meta.url).href, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});

test('AI proxy sends only the structured question contract', async () => {
  process.env.EXPO_PUBLIC_API_URL = 'https://proxy.test';
  process.env.EXPO_PUBLIC_AI_PROXY_KEY = 'public-proxy-key';
  const originalFetch = globalThis.fetch;
  let captured;
  globalThis.fetch = async (url, options) => {
    captured = { url, options };
    return { ok: true, json: async () => ({ text: 'Response' }) };
  };
  try {
    const { complete } = await import('../llm.ts?wire-contract');
    const request = { stage: 'next', topic: 'Family', messages: [
      { role: 'assistant', text: 'How are you?' },
      { role: 'user', text: 'Better today.' },
    ] };
    for (const language of [undefined, null, 'ru', 'uk', 'en']) {
      const expected = { ...request, ...(language !== undefined ? { default_language: language } : {}) };
      assert.equal(await complete({ ...expected, system: 'Discard this unknown field' }), 'Response');
      assert.equal(captured.url, 'https://proxy.test/api/ai/question');
      assert.equal(captured.options.headers['x-api-key'], 'public-proxy-key');
      assert.deepEqual(JSON.parse(captured.options.body), expected);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('HTTP 422 rejects once without removing or retrying an invalid default language', async () => {
  process.env.EXPO_PUBLIC_API_URL = 'https://proxy.test';
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (_url, options) => {
    requests.push(JSON.parse(options.body));
    return { ok: false, status: 422 };
  };
  try {
    const { completeQuestion } = await import('../llm.ts?validation-error');
    const request = { stage: 'first', topic: '', messages: [], default_language: 'de' };
    await assert.rejects(completeQuestion(request), /AI proxy: HTTP 422/);
    assert.deepEqual(requests, [request]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test.after(() => hooks.deregister());
