module.exports = ({ config }) => ({
  ...config,
  plugins: config.plugins.map((plugin) =>
    Array.isArray(plugin) && plugin[0] === 'expo-navigation-bar'
      ? [plugin[0], { ...plugin[1], enforceContrast: true }]
      : plugin,
  ),
});
