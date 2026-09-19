import assert from 'node:assert/strict';
import test from 'node:test';
import { sendContentReport } from '../contentReportClient.ts';

const report = {
  content_type: 'question',
  content_text: 'What gives you hope today?',
  user_comment: 'Unrelated',
  language: 'en',
};

test('sends the exact report contract with the shared API key', async () => {
  let request;
  const result = await sendContentReport(report, {
    url: 'https://api.example/api/ai/content-reports',
    apiKey: 'test-key',
    fetchImpl: async (url, options) => {
      request = { url, options };
      return { ok: true, status: 200, json: async () => ({ status: 'ok', report_id: 42 }) };
    },
  });

  assert.deepEqual(result, { ok: true, reportId: 42 });
  assert.equal(request.url, 'https://api.example/api/ai/content-reports');
  assert.equal(request.options.method, 'POST');
  assert.equal(request.options.headers['x-api-key'], 'test-key');
  assert.deepEqual(JSON.parse(request.options.body), report);
});

test('reports configuration, authorization, validation and malformed responses explicitly', async () => {
  assert.deepEqual(await sendContentReport(report, { url: null }), {
    ok: false,
    error: 'not_configured',
  });
  for (const [status, error] of [[403, 'unauthorized'], [422, 'validation'], [503, 'unavailable']]) {
    assert.deepEqual(await sendContentReport(report, {
      url: 'https://api.example/report',
      fetchImpl: async () => ({ ok: false, status }),
    }), { ok: false, error });
  }
  assert.deepEqual(await sendContentReport(report, {
    url: 'https://api.example/report',
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ status: 'ok' }) }),
  }), { ok: false, error: 'invalid_response' });
});

test('distinguishes timeout from a network failure', async () => {
  let abort;
  const timeout = await sendContentReport(report, {
    url: 'https://api.example/report',
    setTimer: (callback) => {
      abort = callback;
      return 1;
    },
    clearTimer: () => {},
    fetchImpl: async (_url, options) => {
      abort();
      assert.equal(options.signal.aborted, true);
      throw new Error('aborted');
    },
  });
  assert.deepEqual(timeout, { ok: false, error: 'timeout' });

  const network = await sendContentReport(report, {
    url: 'https://api.example/report',
    fetchImpl: async () => { throw new Error('offline'); },
  });
  assert.deepEqual(network, { ok: false, error: 'network' });
});
