const { withAndroidManifest, withGradleProperties, AndroidConfig } = require('expo/config-plugins');

const runtimeMetadataNames = {
  channel: 'garden.lampada.BUILD_CHANNEL',
  apiOrigin: 'garden.lampada.API_ORIGIN',
};

function runtimeMetadata(environment = process.env) {
  const channel = environment.EXPO_PUBLIC_BUILD_CHANNEL;
  if (!['test', 'store'].includes(channel)) {
    throw new Error('EXPO_PUBLIC_BUILD_CHANNEL must be test or store for Android builds.');
  }
  // Проверка адреса и запрет HTTP вне тестового канала общие с transport policy.
  allowsCleartextApi(environment);
  return { channel, apiOrigin: new URL(environment.EXPO_PUBLIC_API_URL).origin };
}

function allowsCleartextApi(environment = process.env) {
  const value = environment.EXPO_PUBLIC_API_URL;
  if (!value) throw new Error('EXPO_PUBLIC_API_URL is required for Android builds.');
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password
    || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('EXPO_PUBLIC_API_URL must be an HTTP(S) server origin.');
  }
  if (url.protocol === 'https:') return false;
  if (environment.EXPO_PUBLIC_BUILD_CHANNEL !== 'test') {
    throw new Error('HTTP API origins are allowed only for test builds.');
  }
  return true;
}

module.exports = (config) => {
  config = withAndroidManifest(config, (mod) => {
    const allowed = allowsCleartextApi();
    const metadata = runtimeMetadata();
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(mod.modResults);
    application.$['android:usesCleartextTraffic'] = String(allowed);
    application['meta-data'] = (application['meta-data'] ?? []).filter((entry) =>
      !Object.values(runtimeMetadataNames).includes(entry.$['android:name']));
    for (const [key, name] of Object.entries(runtimeMetadataNames)) {
      application['meta-data'].push({ $: { 'android:name': name, 'android:value': metadata[key] } });
    }
    return mod;
  });
  return withGradleProperties(config, (mod) => {
    mod.modResults = mod.modResults.filter((property) =>
      property.type !== 'property' || property.key !== 'org.gradle.jvmargs');
    mod.modResults.push({
      type: 'property',
      key: 'org.gradle.jvmargs',
      value: '-Xmx4096m -XX:MaxMetaspaceSize=1024m',
    });
    return mod;
  });
};

module.exports.allowsCleartextApi = allowsCleartextApi;
module.exports.runtimeMetadata = runtimeMetadata;
module.exports.runtimeMetadataNames = runtimeMetadataNames;
