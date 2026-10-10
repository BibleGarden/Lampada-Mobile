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

const rules = (content) => [...content.matchAll(/<(include|exclude) ([^>]*?)\/>/g)]
  .map(([, kind, attributes]) => `${kind} ${attributes}`);
const section = (content, name) => {
  const match = new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`).exec(content);
  assert.ok(match, `${name} section is missing`);
  return match;
};

const journal = 'include domain="file" path="SQLite/"';
const recordings = 'include domain="file" path="Audio/"';
const legacyRules = backupRules[`xml/${backupFiles.fullBackupContent}.xml`];
const flaggedRules = backupRules[`xml-v28/${backupFiles.fullBackupContent}.xml`];
const extractionRules = backupRules[`xml/${backupFiles.dataExtractionRules}.xml`];

test('the plugin writes exactly the referenced rule resources', () => {
  assert.deepEqual(Object.keys(backupRules).sort(), [
    `xml-v28/${backupFiles.fullBackupContent}.xml`,
    `xml/${backupFiles.fullBackupContent}.xml`,
    `xml/${backupFiles.dataExtractionRules}.xml`,
  ]);
});

// Отдельного exclude для SecureStore нет: lint FullBackupContent (FATAL)
// запрещает исключать путь вне включённых, а без include домена sharedpref его
// ключи и так не попадают в копию.
test('no rule includes shared preferences, so SecureStore never enters a copy', () => {
  for (const content of [legacyRules, flaggedRules, extractionRules]) {
    assert.ok(!/<include domain="sharedpref"/.test(content));
  }
  for (const content of [flaggedRules, extractionRules]) {
    assert.ok(!/domain="sharedpref"/.test(content));
  }
});

test('Android 7 to 8.1 keep every app directory out of the backup', () => {
  assert.match(legacyRules, /^<\?xml[^>]*>\n<full-backup-content>/);
  assert.deepEqual(rules(legacyRules),
    ['root', 'file', 'database', 'sharedpref', 'external', 'device_root']
      .map((domain) => `exclude domain="${domain}" path="."`));
});

test('Android 9 to 11 send the journal to the cloud only encrypted and transfer recordings', () => {
  assert.match(flaggedRules, /^<\?xml[^>]*>\n<full-backup-content>/);
  assert.deepEqual(rules(flaggedRules), [
    `${journal} requireFlags="clientSideEncryption"`,
    `${journal} requireFlags="deviceToDeviceTransfer"`,
    `${recordings} requireFlags="deviceToDeviceTransfer"`,
  ]);
});

test('Android 12 cloud backup carries only the encrypted journal', () => {
  const [cloud, body] = section(extractionRules, 'cloud-backup');
  assert.match(cloud, /<cloud-backup disableIfNoEncryptionCapabilities="true">/);
  assert.deepEqual(rules(body), [journal]);
});

test('Android 12 device transfer moves the journal and recordings', () => {
  const [, body] = section(extractionRules, 'device-transfer');
  assert.deepEqual(rules(body), [journal, recordings]);
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
