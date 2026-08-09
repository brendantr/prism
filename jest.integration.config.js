/**
 * THE INTEGRATION LANE RUNS OUTSIDE THE REACT NATIVE TEST ENVIRONMENT
 * ===================================================================
 * The default lane uses the `jest-expo` preset, which is correct for it: those
 * tests exercise code that runs on a device, and the preset supplies the device
 * environment.
 *
 * That preset also installs a `fetch` that **cannot make a real network
 * request**. It is built on `XMLHttpRequest`, which in turn needs React
 * Native's native networking module, which does not exist under Node — so
 * `XMLHttpRequest` is `undefined` and every response comes back as `undefined`.
 * The symptom is memorable and misleading: 19 tests failing in 1.7 seconds with
 * `AuthUnknownError: "undefined" is not valid JSON`, which reads like a broken
 * server and is actually a request that never left the machine.
 *
 * The default lane never noticed because it never needed the network. This lane
 * is nothing but network.
 *
 * So the integration lane uses a plain `node` environment, where Node 22's own
 * `fetch` is real, and stubs the three native modules the data layer imports.
 * That is a faithful trade rather than a compromise: what is under test here is
 * PRism's data layer against Postgres, and `Platform.OS`, the Keychain and the
 * UUID generator are not part of that question. Session storage has its own
 * coverage in `secureStorage.test.ts`, on the device preset, where it belongs.
 *
 * Run it with `npm run test:integration`.
 */

module.exports = {
  rootDir: __dirname,
  testEnvironment: 'node',

  testMatch: ['**/*.integration.test.[jt]s?(x)'],
  // `.claude/worktrees/` holds git worktrees of this same repository, each with
  // its own copy of these files at whatever commit that worktree sits on. Jest
  // walks the whole tree from `rootDir`, so without this it collects those
  // copies too — and this lane CREATES AND DELETES ACCOUNTS on a real project.
  // Running a stale checkout's tests against live staging is not a slower test
  // run, it is a different program touching your data.
  //
  // Seen for real on 2026-08-09: a run from the primary checkout collected four
  // nested copies, and the failure it produced (`AsyncStorage is null`, from the
  // worktrees that predate this config file) read like an app defect.
  //
  // Anchored with `<rootDir>` rather than written as a bare `/\.claude/`. These
  // patterns match the ABSOLUTE path, and an agent worktree lives *at*
  // `.claude/worktrees/<name>/` — so the unanchored form excludes every test in
  // the very checkout you are running from. It matches nothing here and
  // everything there, which is the opposite of the intent.
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/\\.claude/'],

  // `testPathIgnorePatterns` stops those copies being RUN; it does not stop
  // `jest-haste-map` INDEXING them, and the crawler reads every `package.json`
  // it finds. Each nested worktree has one declaring `"name": "prism"`, so the
  // run still opened with `Haste module naming collision: prism`. Cosmetic here
  // — but a haste map holding two modules under one name is a resolution
  // hazard, not just noise, and the warning trains people to ignore output from
  // the one lane that talks to a real project.
  modulePathIgnorePatterns: ['<rootDir>/\\.claude/'],

  // `babel-preset-expo` on its own, without the preset's device setup files.
  transform: {
    '^.+\\.[jt]sx?$': ['babel-jest', { presets: ['babel-preset-expo'] }],
  },

  // `babel-preset-expo` injects an import of `expo/virtual/env`, which ships as
  // ESM. Jest skips `node_modules` when transforming, so without this exception
  // that file arrives untransformed and dies on `Unexpected token 'export'` —
  // pointing at `client.ts`, which is not where the problem is.
  transformIgnorePatterns: ['node_modules/(?!(expo|expo-modules-core|@expo)/)'],

  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    // `secureStorage.ts` reads `Platform.OS`. Nothing else in the data layer
    // touches React Native, so a two-line stub is the whole requirement.
    '^react-native$': '<rootDir>/src/data/supabase/__tests__/support/stubs/reactNative.js',
    // Native crypto and Keychain, replaced with Node equivalents. The Keychain
    // stub keeps SecureStore's real ~2048-byte ceiling so the chunking path is
    // still exercised by a server-issued session.
    '^expo-crypto$': '<rootDir>/src/data/supabase/__tests__/support/stubs/expoCrypto.js',
    '^expo-secure-store$': '<rootDir>/src/data/supabase/__tests__/support/stubs/expoSecureStore.js',
    '^@react-native-async-storage/async-storage$':
      '<rootDir>/src/data/supabase/__tests__/support/stubs/asyncStorage.js',
  },

  setupFiles: ['<rootDir>/src/data/supabase/__tests__/support/integrationSetup.js'],

  // Network round-trips against a hosted project, from CI runners on bad days.
  testTimeout: 30000,
};
