const { withAndroidManifest, withGradleProperties, AndroidConfig } = require('expo/config-plugins');

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
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(mod.modResults);
    application.$['android:usesCleartextTraffic'] = String(allowed);
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
