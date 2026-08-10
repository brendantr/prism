const { getSentryExpoConfig } = require('@sentry/react-native/metro');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getSentryExpoConfig(__dirname, {
  // Crash reporting does not authorize session replay or its web bundle.
  includeWebReplay: false,
  // Development bundles never initialise telemetry.
  enableSourceContextInDevelopment: false,
});

module.exports = config;
