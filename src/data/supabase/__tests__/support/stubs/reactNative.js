/**
 * The only thing PRism's data layer imports from React Native: `Platform.OS`.
 * `secureStorage.ts` reads it, and nothing else in the graph touches RN.
 */
module.exports = { Platform: { OS: 'ios', select: (spec) => spec.ios ?? spec.default } };
