import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const transcriptionUrl = pathToFileURL(resolve('lib/transcription.ts')).href;
const runtimeModules = {
  'expo/fetch': 'export const fetch = (...args) => globalThis.__transcriptionRuntime.fetch(...args);',
  'expo-file-system': `export class File extends Blob {
    constructor(uri) {
      // Android выводит тип по расширению .m4a как audio/mpeg.
      super(['audio'.repeat(256)], { type: 'audio/mpeg' });
      this.exists = true;
      this.name = 'recording.m4a';
      Object.defineProperty(this, 'size', { value: globalThis.__transcriptionRuntime.size });
    }
  }`,
  './transcriptionConfig': 'export const deviceLocale = () => globalThis.__transcriptionRuntime.locale ?? null;',
  './db': 'export const recordDiagnostic = (...args) => globalThis.__transcriptionRuntime.diagnostics.push(args);',
  './apiConfig': `export const apiPaths = { transcription: '/api/ai/transcribe' };
    export const resolveApiUrl = () => 'https://example.invalid/api/ai/transcribe';`,
  './audioFileDuration': 'export const audioFileDurationSeconds = async () => globalThis.__transcriptionRuntime.duration;',
  './settings': 'export const audioTranscriptionAllowedNow = () => true;',
};

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (context.parentURL === transcriptionUrl) {
      const source = runtimeModules[specifier];
      if (source) {
        return { url: `data:text/javascript,${encodeURIComponent(source)}`, shortCircuit: true };
      }
      if (specifier === './transcriptionPreflight' || specifier === './transcriptionErrors') {
        const file = fileURLToPath(context.parentURL).replace(/transcription\.ts$/, `${specifier.slice(2)}.ts`);
        return { url: pathToFileURL(file).href, shortCircuit: true };
      }
    }
    return nextResolve(specifier, context);
  },
});

const { reportTranscriptionFailure, transcribeRecording } = await import('../transcription.ts');

test('the real transcription entry point uploads the file as audio/mp4 whatever the platform type', async () => {
  const requests = [];
  globalThis.__transcriptionRuntime = {
    size: 4_096,
    duration: 599.98,
    locale: 'ru-RU',
    fetch: async (url, init) => {
      requests.push(new Request(url, init));
      return new Response(JSON.stringify({ text: 'A short prayer' }), { status: 200 });
    },
  };
  assert.equal(await transcribeRecording('file:///prayer.m4a'), 'A short prayer');
  assert.equal(requests.length, 1);
  const form = await requests[0].formData();
  const file = form.get('file');
  assert.equal(file.type, 'audio/mp4');
  assert.equal(file.name, 'recording.m4a');
  assert.equal(await file.text(), 'audio'.repeat(256));
  assert.equal(form.get('locale'), 'ru-RU');
  assert.deepEqual([...form.keys()], ['file', 'locale']);
});

test('the upload omits the locale part when the device locale is unknown', async () => {
  let form;
  globalThis.__transcriptionRuntime = {
    size: 4_096,
    duration: 12,
    fetch: async (url, init) => {
      form = await new Request(url, init).formData();
      return new Response(JSON.stringify({ text: 'A short prayer' }), { status: 200 });
    },
  };
  await transcribeRecording('file:///prayer.m4a');
  assert.deepEqual([...form.keys()], ['file']);
});

test('a rejected upload keeps its HTTP status for diagnostics without the response body', async () => {
  globalThis.__transcriptionRuntime = {
    size: 4_096,
    duration: 12,
    diagnostics: [],
    fetch: async () => new Response('{"detail":"Unsupported audio format"}', { status: 415 }),
  };
  const error = await transcribeRecording('file:///prayer.m4a').catch((failure) => failure);
  assert.equal(error.code, 'unknown');
  assert.equal(error.status, 415);
  const warn = console.warn;
  const warnings = [];
  console.warn = (...args) => warnings.push(args);
  try {
    reportTranscriptionFailure('journal', error);
  } finally {
    console.warn = warn;
  }
  const details = { place: 'journal', code: 'unknown', errorClass: 'TranscriptionError', status: 415 };
  assert.deepEqual(globalThis.__transcriptionRuntime.diagnostics, [['transcription_failed', details]]);
  assert.deepEqual(warnings, [['Failed to transcribe audio recording', details]]);
});

test('the real transcription entry point cannot upload an oversized or overlong file', async () => {
  let calls = 0;
  globalThis.__transcriptionRuntime = {
    size: 14 * 1024 * 1024 + 1,
    duration: 599.98,
    fetch: async () => { calls += 1; throw new Error('fetch must not run'); },
  };
  await assert.rejects(transcribeRecording('file:///oversized.m4a'), (error) => error.code === 'too_long');
  globalThis.__transcriptionRuntime.size = 4_096;
  globalThis.__transcriptionRuntime.duration = 600.02;
  await assert.rejects(transcribeRecording('file:///overlong.m4a'), (error) => error.code === 'too_long');
  assert.equal(calls, 0);
});
