const { AndroidConfig, withAndroidStyles, withMainActivity } = require('expo/config-plugins');

const START = '    // BEGIN lampada-navigation-bar';
const END = '    // END lampada-navigation-bar';

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
  const snippet = `${START}
    if (android.os.Build.VERSION.SDK_INT < android.os.Build.VERSION_CODES.Q) {
      window.navigationBarColor = android.graphics.Color.argb(0x80, 0x1b, 0x1b, 0x1b)
    }
    androidx.core.view.WindowInsetsControllerCompat(window, window.decorView)
      .isAppearanceLightNavigationBars = ${style === 'dark'}
${END}`;
  const start = contents.indexOf(START);
  const end = contents.indexOf(END);
  if (start !== -1 || end !== -1) {
    if (start === -1 || end < start || contents.indexOf(START, start + 1) !== -1
      || contents.indexOf(END, end + 1) !== -1) {
      throw new Error('Android navigation-bar markers are malformed.');
    }
    return contents.slice(0, start) + snippet + contents.slice(end + END.length);
  }
  const anchor = 'super.onCreate(null)';
  const at = contents.indexOf(anchor);
  if (at === -1 || contents.indexOf(anchor, at + 1) !== -1) {
    throw new Error('Expected exactly one super.onCreate(null) in Kotlin MainActivity.');
  }
  return contents.slice(0, at + anchor.length) + '\n' + snippet
    + contents.slice(at + anchor.length);
}

function applySplashStyles(styles, options) {
  for (const [name, value, targetApi] of [
    ['android:windowLightNavigationBar', String(options.style === 'dark'), '27'],
    ['android:enforceNavigationBarContrast', String(options.enforceContrast), '29'],
    ['android:navigationBarColor', '@android:color/transparent'],
  ]) {
    styles = AndroidConfig.Styles.assignStylesValue(styles, {
      add: true, name, value, targetApi, parent: { name: 'Theme.App.SplashScreen' },
    });
  }
  styles.resources.$ ??= {};
  styles.resources.$['xmlns:tools'] = 'http://schemas.android.com/tools';
  return styles;
}

module.exports = (config) => {
  const options = navigationBarOptions(config);
  config = withAndroidStyles(config, (mod) => {
    mod.modResults = applySplashStyles(mod.modResults, options);
    return mod;
  });
  return withMainActivity(config, (mod) => {
    if (mod.modResults.language !== 'kt') throw new Error('Android system bars require a Kotlin MainActivity.');
    mod.modResults.contents = applyStartupStyle(mod.modResults.contents, options.style);
    return mod;
  });
};

module.exports.applyStartupStyle = applyStartupStyle;
module.exports.applySplashStyles = applySplashStyles;
module.exports.navigationBarOptions = navigationBarOptions;
