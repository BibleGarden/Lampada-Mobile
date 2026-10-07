import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { parseEnv } from 'node:util';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { AndroidConfig } = require('expo/config-plugins');
const { runtimeMetadataNames } = require('../plugins/withAndroidBuild.js');

export function validateInstalledAndroid(manifest, environment) {
  const application = AndroidConfig.Manifest.getMainApplicationOrThrow(manifest);
  const value = (name) => {
    const entries = (application['meta-data'] ?? []).filter((entry) => entry.$['android:name'] === name);
    if (entries.length !== 1 || typeof entries[0].$['android:value'] !== 'string') {
      throw new Error('Installed APK has missing or ambiguous runtime metadata; rebuild and reinstall it.');
    }
    return entries[0].$['android:value'];
  };
  if (value(runtimeMetadataNames.channel) !== 'test') {
    throw new Error('Installed APK is not a test build. No scenarios were started.');
  }
  const expected = new URL(environment.EXPO_PUBLIC_API_URL);
  if (!['http:', 'https:'].includes(expected.protocol) || expected.username || expected.password
    || expected.pathname !== '/' || expected.search || expected.hash) {
    throw new Error('Expected test API must be an HTTP(S) server origin.');
  }
  const installed = value(runtimeMetadataNames.apiOrigin);
  if (new URL(installed).hostname === 'api.bible.garden' || expected.hostname === 'api.bible.garden') {
    throw new Error('Android e2e must not target the production API. No scenarios were started.');
  }
  if (installed !== expected.origin) {
    throw new Error('Installed APK API origin differs from .env.local; rebuild and reinstall it. No scenarios were started.');
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const manifest = await AndroidConfig.Manifest.readAndroidManifestAsync(process.argv[2]);
    validateInstalledAndroid(manifest, parseEnv(readFileSync(process.argv[3], 'utf8')));
    console.log('Installed APK test channel and API origin verified.');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
