// The "@/*" path alias is resolved by Metro directly from tsconfig.json
// (expo/metro-config enables tsconfig paths by default on SDK 50+),
// so no module-resolver plugin is required here.
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: ['react-native-reanimated/plugin'],
  };
};
