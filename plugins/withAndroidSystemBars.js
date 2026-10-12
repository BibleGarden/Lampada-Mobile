const { AndroidConfig, withAndroidStyles, withMainActivity } = require('expo/config-plugins');
const { mergeContents } = require('@expo/config-plugins/build/utils/generateCode');

function navigationBarOptions(config) {
  const plugin = config.plugins.find((entry) =>
    Array.isArray(entry) && entry[0] === 'expo-navigation-bar');
  const options = plugin?.[1];
  if (!options || !['light', 'dark'].includes(options.style)
    || typeof options.enforceContrast !== 'boolean') {
    throw new Error('expo-navigation-bar must configure style and enforceContrast in app.json.');
  }
  return options;
}

function applyStartupStyle(contents, style) {
  return mergeContents({
    tag: 'lampada-navigation-bar',
    src: contents,
    newSrc: `    androidx.core.view.WindowInsetsControllerCompat(window, window.decorView)\n      .isAppearanceLightNavigationBars = ${style === 'dark'}`,
    anchor: /super\.onCreate\(null\)/,
    offset: 1,
    comment: '//',
  }).contents;
}

module.exports = (config) => {
  const options = navigationBarOptions(config);
  config = withAndroidStyles(config, (mod) => {
    for (const [name, value] of [
      ['android:windowLightNavigationBar', String(options.style === 'dark')],
      ['android:enforceNavigationBarContrast', String(options.enforceContrast)],
      ['android:navigationBarColor', '@android:color/transparent'],
    ]) {
      mod.modResults = AndroidConfig.Styles.assignStylesValue(mod.modResults, {
        add: true, name, value, parent: { name: 'Theme.App.SplashScreen' },
      });
    }
    return mod;
  });
  return withMainActivity(config, (mod) => {
    if (mod.modResults.language !== 'kt') throw new Error('Android system bars require a Kotlin MainActivity.');
    mod.modResults.contents = applyStartupStyle(mod.modResults.contents, options.style);
    return mod;
  });
};

module.exports.applyStartupStyle = applyStartupStyle;
module.exports.navigationBarOptions = navigationBarOptions;
