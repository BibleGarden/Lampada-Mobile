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
  process.env.EXPO_PUBLIC_AI_PROXY_URL = 'https://proxy.test/api/ai/question';
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
    assert.equal(await complete(request), 'Response');
    assert.equal(captured.url, 'https://proxy.test/api/ai/question');
    assert.equal(captured.options.headers['x-api-key'], 'public-proxy-key');
    assert.deepEqual(JSON.parse(captured.options.body), request);
  } finally {
    globalThis.fetch = originalFetch;
    hooks.deregister();
  }
});
