// The "@/*" path alias is resolved by Metro directly from tsconfig.json
// (expo/metro-config reads tsconfig paths), so no module-resolver plugin here.
//
// Deliberately no reanimated/worklets plugin. Reanimated 4 moved its plugin to
// `react-native-worklets/plugin`, and on SDK 54+ babel-preset-expo wires that
// up automatically when reanimated is present — declaring it by hand is now an
// error. PRism imports reanimated nowhere, so the dependency is gone entirely.
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [require.resolve('expo-router/babel')],
  };
};
