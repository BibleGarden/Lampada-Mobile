const fs = require('fs');
const path = require('path');
const { withAndroidManifest, withDangerousMod, AndroidConfig } = require('expo/config-plugins');

// Android Auto Backup rules (ADR-0040). Any <include> restricts the copy to
// what is listed, so everything else stays out of it: cache, the diagnostic
// log, and all SharedPreferences, including SecureStore keys. Those keys are
// encrypted with this device's Android Keystore key and cannot be decrypted
// on another device.
//
// - `files/SQLite/` — the journal: `lampada.db` from expo-sqlite with its WAL
//   files. It goes to the cloud only with end-to-end encryption, that is,
//   when a screen lock is set.
// - `files/Audio/` — expo-audio voice recordings. Only for a direct transfer
//   to a new phone: the cloud copy is capped at 25 MB per app, and past that
//   Android stops backing up the app entirely, while recordings at 48 kbit/s
//   take up about 22 MB per hour.
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

// Resources by their paths inside `res/`.
const backupRules = {
  // Android 7–8.1 do not know requireFlags, and the copy there is not
  // end-to-end encrypted: excluding every domain keeps data on-device only.
  [`xml/${backupFiles.fullBackupContent}.xml`]: xml('full-backup-content',
    ['root', 'file', 'database', 'sharedpref', 'external', 'device_root']
      .map((domain) => `<exclude domain="${domain}" path="."/>`)),
  // Android 9–11: one rule set for cloud and transfer; requireFlags sets the condition.
  [`xml-v28/${backupFiles.fullBackupContent}.xml`]: xml('full-backup-content', [
    `<include ${journal} requireFlags="clientSideEncryption"/>`,
    `<include ${journal} requireFlags="deviceToDeviceTransfer"/>`,
    `<include ${recordings} requireFlags="deviceToDeviceTransfer"/>`,
  ]),
  // Android 12 and newer.
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
