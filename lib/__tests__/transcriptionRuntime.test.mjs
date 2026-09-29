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
      super(['audio'.repeat(256)], { type: 'audio/mp4' });
      this.exists = true;
      this.name = 'recording.m4a';
      Object.defineProperty(this, 'size', { value: globalThis.__transcriptionRuntime.size });
    }
  }`,
  './transcriptionConfig': 'export const deviceLocale = () => null;',
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

const { transcribeRecording } = await import('../transcription.ts');

test('the real transcription entry point uploads an admissible file', async () => {
  let calls = 0;
  globalThis.__transcriptionRuntime = {
    size: 4_096,
    duration: 599.98,
    fetch: async () => {
      calls += 1;
      return new Response(JSON.stringify({ text: 'A short prayer' }), { status: 200 });
    },
  };
  assert.equal(await transcribeRecording('file:///prayer.m4a'), 'A short prayer');
  assert.equal(calls, 1);
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
