/**
 * `client.ts` reads `__DEV__` to decide the demo-mode default. It is a React
 * Native global, absent from a plain Node environment, and referencing it would
 * throw before any test ran.
 *
 * Set to `false` deliberately: this lane is the real backend, and `false` is
 * what a release bundle sees. `loadApp()` sets `EXPO_PUBLIC_DEMO_MODE=false`
 * explicitly anyway, so this is belt and braces rather than the mechanism.
 */
globalThis.__DEV__ = false;
