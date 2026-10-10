import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { backupFiles, backupRules } = require('../../plugins/withAndroidBackupRules.js');
const repo = fileURLToPath(new URL('../../', import.meta.url));
const read = (path) => readFileSync(join(repo, path), 'utf8');

const rules = (content) => [...content.matchAll(/<(include|exclude) domain="([^"]+)" path="([^"]+)"\/>/g)]
  .map(([, kind, domain, path]) => `${kind} ${domain}:${path}`);
const section = (content, name) => {
  const match = new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`).exec(content);
  assert.ok(match, `${name} section is missing`);
  return match;
};

const journal = 'include file:SQLite/';
const recordings = 'include file:Audio/';
const secureStore = 'exclude sharedpref:SecureStore.xml';

test('Android 11 and lower back up the journal without recordings or SecureStore', () => {
  const content = backupRules[backupFiles.fullBackupContent];
  assert.match(content, /^<\?xml[^>]*>\n<full-backup-content>/);
  assert.deepEqual(rules(content), [journal, secureStore]);
});

test('Android 12 cloud backup carries only the encrypted journal', () => {
  const [cloud, body] = section(backupRules[backupFiles.dataExtractionRules], 'cloud-backup');
  assert.match(cloud, /<cloud-backup disableIfNoEncryptionCapabilities="true">/);
  assert.deepEqual(rules(body), [journal, secureStore]);
});

test('Android 12 device transfer moves the journal and recordings without SecureStore', () => {
  const [, body] = section(backupRules[backupFiles.dataExtractionRules], 'device-transfer');
  assert.deepEqual(rules(body), [journal, recordings, secureStore]);
});

test('app config applies the own rules instead of the expo-secure-store ones', () => {
  const { expo } = JSON.parse(read('app.json'));
  assert.ok(expo.plugins.includes('./plugins/withAndroidBackupRules'));
  assert.deepEqual(
    expo.plugins.find((plugin) => Array.isArray(plugin) && plugin[0] === 'expo-secure-store'),
    ['expo-secure-store', { configureAndroidBackup: false }],
  );
});

// Пути правил повторяют каталоги нативных модулей: при обновлении Expo тест
// покажет, что дневник или записи переехали и копия их больше не видит.
test('backup paths match the native storage directories', () => {
  assert.match(
    read('node_modules/expo-sqlite/android/src/main/java/expo/modules/sqlite/SQLiteModule.kt'),
    /context\.filesDir\.canonicalPath \+ File\.separator \+ "SQLite"/,
  );
  assert.match(read('lib/db.ts'), /openDatabaseAsync\('lampada\.db'\)/);
  assert.match(
    read('node_modules/expo-audio/android/src/main/java/expo/modules/audio/AudioRecorder.kt'),
    /RecordingDirectory\.DOCUMENT -> _appContext\.persistentFilesDirectory[\s\S]*File\(parentDirectory, "Audio"\)/,
  );
  assert.match(read('components/AnswerSheet.tsx'), /directory: 'document' as const/);
  assert.match(
    read('node_modules/expo-secure-store/android/src/main/java/expo/modules/securestore/SecureStoreModule.kt'),
    /SHARED_PREFERENCES_NAME = "SecureStore"/,
  );
});
