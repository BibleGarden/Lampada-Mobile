const fs = require('fs');
const path = require('path');
const { withAndroidManifest, withDangerousMod, AndroidConfig } = require('expo/config-plugins');

// Правила Android Auto Backup (ADR-0040). Любой <include> ограничивает копию
// перечисленным, поэтому всё остальное в неё не попадает: кэш, диагностический
// лог и все SharedPreferences, включая ключи SecureStore. Эти ключи зашифрованы
// ключом Android Keystore этого устройства и на другом не расшифруются.
//
// - `files/SQLite/` — дневник: `lampada.db` из expo-sqlite с файлами WAL.
//   В облако он уходит только со сквозным шифрованием, то есть при заданной
//   блокировке экрана.
// - `files/Audio/` — голосовые записи expo-audio. Только при прямом переносе
//   на новый телефон: облачная копия ограничена 25 МБ на приложение, при
//   превышении Android перестаёт копировать приложение целиком, а записи при
//   48 кбит/с занимают около 22 МБ в час.
const backupFiles = {
  fullBackupContent: 'lampada_backup_rules',
  dataExtractionRules: 'lampada_data_extraction_rules',
};

const journal = 'domain="file" path="SQLite/"';
const recordings = 'domain="file" path="Audio/"';

const xml = (root, lines) => [
  '<?xml version="1.0" encoding="utf-8"?>',
  `<${root}>`,
  ...lines.map((line) => `  ${line}`),
  `</${root}>`,
  '',
].join('\n');

const section = (name, attributes, lines) =>
  [`<${name}${attributes}>`, ...lines.map((line) => `  ${line}`), `</${name}>`];

// Ресурсы по путям внутри `res/`.
const backupRules = {
  // Android 7–8.1 не знают requireFlags, а копия там не шифруется сквозным
  // ключом: исключение всех каталогов оставляет данные только на устройстве.
  [`xml/${backupFiles.fullBackupContent}.xml`]: xml('full-backup-content',
    ['root', 'file', 'database', 'sharedpref', 'external', 'device_root']
      .map((domain) => `<exclude domain="${domain}" path="."/>`)),
  // Android 9–11: одни правила на облако и перенос, условие задаёт requireFlags.
  [`xml-v28/${backupFiles.fullBackupContent}.xml`]: xml('full-backup-content', [
    `<include ${journal} requireFlags="clientSideEncryption"/>`,
    `<include ${journal} requireFlags="deviceToDeviceTransfer"/>`,
    `<include ${recordings} requireFlags="deviceToDeviceTransfer"/>`,
  ]),
  // Android 12 и выше.
  [`xml/${backupFiles.dataExtractionRules}.xml`]: xml('data-extraction-rules', [
    ...section('cloud-backup', ' disableIfNoEncryptionCapabilities="true"', [`<include ${journal}/>`]),
    ...section('device-transfer', '', [`<include ${journal}/>`, `<include ${recordings}/>`]),
  ]),
};

module.exports = (config) => {
  config = withAndroidManifest(config, (mod) => {
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(mod.modResults);
    for (const [attribute, file] of Object.entries(backupFiles)) {
      application.$[`android:${attribute}`] = `@xml/${file}`;
    }
    return mod;
  });
  return withDangerousMod(config, ['android', async (mod) => {
    const resources = path.join(mod.modRequest.platformProjectRoot, 'app/src/main/res');
    for (const [file, content] of Object.entries(backupRules)) {
      const target = path.join(resources, file);
      await fs.promises.mkdir(path.dirname(target), { recursive: true });
      await fs.promises.writeFile(target, content);
    }
    return mod;
  }]);
};

module.exports.backupFiles = backupFiles;
module.exports.backupRules = backupRules;
