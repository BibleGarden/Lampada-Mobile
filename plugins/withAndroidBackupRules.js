const fs = require('fs');
const path = require('path');
const { withAndroidManifest, withDangerousMod, AndroidConfig } = require('expo/config-plugins');

// Правила Android Auto Backup (ADR-0040). Любой <include> ограничивает копию
// перечисленным, поэтому всё остальное в неё не попадает: кэш, диагностический
// лог, SharedPreferences других модулей.
//
// - `files/SQLite/` — дневник: `lampada.db` из expo-sqlite с файлами WAL.
// - `files/Audio/` — голосовые записи expo-audio. Только в device-transfer:
//   облачная копия ограничена 25 МБ на приложение, и при превышении Android
//   перестаёт копировать приложение целиком, а записи при 48 кбит/с занимают
//   около 22 МБ в час. У прямого переноса на новый телефон такой квоты нет.
// - `shared_prefs/SecureStore.xml` исключён везде: ключи защиты зашифрованы
//   ключом Android Keystore этого устройства и на другом не расшифруются.
const backupFiles = {
  fullBackupContent: 'lampada_backup_rules',
  dataExtractionRules: 'lampada_data_extraction_rules',
};

const journal = '<include domain="file" path="SQLite/"/>';
const recordings = '<include domain="file" path="Audio/"/>';
const secureStore = '<exclude domain="sharedpref" path="SecureStore.xml"/>';

const xml = (root, lines) => [
  '<?xml version="1.0" encoding="utf-8"?>',
  `<${root}>`,
  ...lines.map((line) => `  ${line}`),
  `</${root}>`,
  '',
].join('\n');

const section = (name, attributes, lines) =>
  [`<${name}${attributes}>`, ...lines.map((line) => `  ${line}`), `</${name}>`];

const backupRules = {
  // Android 11 и ниже: одни правила и для облака, и для переноса.
  [backupFiles.fullBackupContent]: xml('full-backup-content', [journal, secureStore]),
  // Android 12 и выше. В облако дневник уходит только со сквозным шифрованием,
  // то есть при заданной блокировке экрана.
  [backupFiles.dataExtractionRules]: xml('data-extraction-rules', [
    ...section('cloud-backup', ' disableIfNoEncryptionCapabilities="true"', [journal, secureStore]),
    ...section('device-transfer', '', [journal, recordings, secureStore]),
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
    const directory = path.join(mod.modRequest.platformProjectRoot, 'app/src/main/res/xml');
    await fs.promises.mkdir(directory, { recursive: true });
    for (const [file, content] of Object.entries(backupRules)) {
      await fs.promises.writeFile(path.join(directory, `${file}.xml`), content);
    }
    return mod;
  }]);
};

module.exports.backupFiles = backupFiles;
module.exports.backupRules = backupRules;
