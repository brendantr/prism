/**
 * A WebSocket stand-in for unit tests that construct a real Supabase client.
 *
 * WHY THIS EXISTS
 * ---------------
 * `createClient()` builds a `RealtimeClient` eagerly, and that resolves a
 * WebSocket implementation at construction time:
 *
 *   RealtimeClient.js: transport = options?.transport ?? WebSocketFactory.getWebSocketConstructor()
 *
 * On a Node runtime with no global `WebSocket`, that factory throws
 * `Node.js detected but native WebSocket not found.` and the client cannot be
 * constructed at all. Node 22+ has a global `WebSocket`; older runtimes do not,
 * so a suite can pass locally and fail on CI purely on runtime version.
 *
 * That is an **environment difference, not a product problem**. Nothing in
 * PRism's auth or session handling uses realtime. Injecting a transport removes
 * the runtime dependency without touching a single line of the behaviour under
 * test.
 *
 * WHY IT THROWS INSTEAD OF NO-OPING
 * ---------------------------------
 * Verified against this version of the library: the transport is **never
 * constructed by any auth path** — a client built with a constructor that
 * throws still completes `createClient()` and `auth.getSession()` without
 * touching it.
 *
 * So this is a tripwire rather than a fake. If a future test starts exercising
 * realtime, it fails loudly here instead of passing quietly against a stub that
 * silently pretends to work. A test that needs a real socket belongs in the
 * integration lane — see `*.integration.test.ts` and `npm run test:integration`.
 */
export class UnusedRealtimeTransport {
  constructor() {
    throw new Error(
      'Realtime transport was constructed in a unit test. PRism\'s session handling ' +
        'never opens a socket, so this means the test is exercising realtime. Move ' +
        'that coverage to a *.integration.test.ts file (npm run test:integration).',
    );
  }
}

/**
 * Client options that keep a real Supabase client constructible on any Node
 * version. Spread into `createClient`'s third argument.
 */
export const OFFLINE_REALTIME_OPTIONS = {
  realtime: { transport: UnusedRealtimeTransport as never },
} as const;
