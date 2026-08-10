import * as Sentry from '@sentry/react-native';
import { DEMO_MODE } from '@/data/supabase/client';
import {
  formatSurfaceLog,
  resolveTelemetryMode,
  scrubTelemetryBreadcrumb,
  scrubTelemetryEvent,
  type TelemetryMode,
  type TelemetrySurface,
} from '@/domain/telemetry';

/**
 * CRASH REPORTING — the impure boundary
 * =====================================
 * Everything that touches the Sentry SDK lives here. Every *rule* it obeys
 * lives in `src/domain/telemetry.ts`, where it is a pure function with tests.
 * The split exists because this repo has no component-test tooling by decision,
 * so a privacy guarantee written inside an SDK callback is one nobody can
 * verify; moved next door, it is a table of assertions.
 *
 * Closes the crash-reporting half of `Docs/architecture.md` G-4. **Only that
 * half** — there is deliberately no analytics, no product tracking, no session
 * tracking and no performance tracing here, and `Docs/privacy-policy-draft.md`
 * §2.4's "no analytics" claim stays true because of what this file does not do.
 *
 * MODE FLAGS AT MODULE LOAD
 * -------------------------
 * The posture is copied from `src/data/supabase/client.ts`, deliberately: read
 * the environment once, compute a named flag, document each one, and let every
 * later call read the flag rather than re-deriving the condition. The app must
 * work perfectly with `EXPO_PUBLIC_SENTRY_DSN` unset — that is the dev and demo
 * case and the state `.env.example` ships in — so "not configured" is a normal
 * mode with a name, not an error.
 *
 * THE DSN IS PUBLIC BY DESIGN
 * ---------------------------
 * Same class of value as the Supabase anon key: it identifies a project to
 * write into and grants no read access, which is why it is an `EXPO_PUBLIC_*`
 * variable and safe to inline into a bundle (`Docs/invariants.md` I-4). No real
 * DSN appears in this repository — `.env.example` ships it blank (I-5).
 */

const DSN = process.env.EXPO_PUBLIC_SENTRY_DSN;

/**
 * Whether crash reporting runs in this build, and if not, why.
 *
 * `DEMO_MODE` is imported rather than re-read from the environment: its
 * precedence rules are subtle (an explicit flag wins in both directions, and
 * `__DEV__` decides otherwise), and two copies of that logic would eventually
 * disagree about which build is which.
 */
export const TELEMETRY_MODE: TelemetryMode = resolveTelemetryMode({
  dsn: DSN,
  demoMode: DEMO_MODE,
  devBundle: __DEV__,
});

/** True only in a release, non-demo build with a DSN configured. */
export const TELEMETRY_ENABLED = TELEMETRY_MODE.enabled;

let initialised = false;

/**
 * Start crash reporting, or do nothing at all.
 *
 * Called at module scope from `app/_layout.tsx` so it runs before the first
 * render — it is synchronous, touches no store, and starts no navigation, so it
 * sits outside the startup gate rather than inside it.
 *
 * When `TELEMETRY_ENABLED` is false this returns before `Sentry.init`, which is
 * the property that keeps Metro and Jest from ever opening a connection: an
 * uninitialised SDK's `captureException` is a no-op with no client to send to.
 */
export function initTelemetry(): void {
  if (!TELEMETRY_MODE.enabled || initialised) return;
  initialised = true;

  try {
    Sentry.init({
      dsn: TELEMETRY_MODE.dsn,

    /*
      PRIVACY CONFIGURATION. Read this block against
      `Docs/privacy-data-inventory.md` §6 — the store privacy declarations are
      written from it, and changing a line here changes a store form.

      PRism holds health-adjacent data (I-7): bodyweight, body measurements, and
      daily 1-5 ratings for sleep, energy, soreness and stress. None of it has
      any business in a crash report, and none of the mechanisms that would
      carry it there are switched on.
    */

    /** No IP address, no cookies, no request headers, no user identity. */
      sendDefaultPii: false,

    /*
      NO VISUAL CAPTURE OF ANY KIND.

      A screenshot of the Today screen is a picture of a lifter's wellbeing
      ratings; a view hierarchy is the same data as text; session replay is both,
      continuously. All three are opt-in in this SDK and all three stay off. The
      replay rates are set explicitly rather than left at their defaults so that
      "we do not record your screen" is a line in this file, not an assumption
      about a default that a future SDK version could change.
    */
      attachScreenshot: false,
      attachViewHierarchy: false,
      replaysSessionSampleRate: 0,
      replaysOnErrorSampleRate: 0,

    /*
      NO ANALYTICS, AND THIS IS WHERE THAT IS ENFORCED.

      `enableAutoSessionTracking` sends a session on every app foreground —
      aggregate and anonymous, but it would still mean PRism knows when you last
      opened the app, which `Docs/privacy-policy-draft.md` §2.4 says it does not.
      Performance tracing spans carry request URLs. Failed-request capture turns
      every 4xx from PostgREST into an event. Client reports are periodic
      counters. Crash reporting is the whole scope of this sprint, so none of
      them run: nothing is sent unless something actually failed.
    */
      enableAutoSessionTracking: false,
      enableAutoPerformanceTracing: false,
      enableCaptureFailedRequests: false,
      tracesSampleRate: 0,
      sendClientReports: false,

    /** Code, not user data — and the reason a report is worth having. */
      attachStacktrace: true,

    /**
     * Fewer, and filtered. `scrubTelemetryEvent` drops the `console` category
     * outright; a shorter tail also means less incidental context travelling
     * with an event.
     */
      maxBreadcrumbs: 30,

    /** Filter before breadcrumbs reach either JavaScript or native crash state. */
      beforeBreadcrumb: (breadcrumb) =>
        scrubTelemetryBreadcrumb(
          breadcrumb as unknown as Record<string, unknown>,
        ) as typeof breadcrumb | null,

    /**
     * The last thing that runs before anything leaves the device.
     *
     * Rebuilds the event from an allowlist, then redacts identifiers from every
     * string that survives. See `scrubTelemetryEvent` and its tests.
     */
      beforeSend: (event) =>
        scrubTelemetryEvent(event as unknown as Record<string, unknown>) as unknown as typeof event,
    });
  } catch (cause) {
    // Observability must never become a startup dependency. A malformed DSN or
    // SDK failure leaves the app usable and remains visible in the local log.
    initialised = false;
    console.warn('[telemetry] initialization failed', cause);
  }

  /*
    DELIBERATELY NOT CALLED: `Sentry.setUser(...)`.

    Attaching the Supabase user id would make every crash report linkable to an
    account, which changes the store disclosure. It buys triage convenience and
    nothing a lifter benefits from. `scrubTelemetryEvent` does not allow a user
    field regardless, so adding a `setUser` call later without also changing
    that rule — and the two privacy documents — cannot silently ship identity.
  */
}

/**
 * Report an error that was caught, handled, and never shown in full to the
 * lifter.
 *
 * These are exactly the failures that are invisible in production today: the
 * six sites that catch, warn to a console nobody is reading, and show a calm
 * sentence instead. The `console.warn` is kept verbatim — it is the dev-time
 * affordance and someone's grep target — and reporting is added alongside it.
 *
 * Raw caught values are never handed to the SDK. `toReportable` keeps code
 * frames from a real Error but replaces its message with the fixed call-site
 * label; the outbound allowlist then replaces exception text again.
 */
export function reportHandledError(
  surface: TelemetrySurface,
  message: string,
  cause: unknown,
): void {
  console.warn(formatSurfaceLog(surface, message), cause);

  if (!TELEMETRY_ENABLED) return;

  Sentry.captureException(toReportable(surface, message, cause), {
    tags: { surface },
    level: 'error',
  });
}

/**
 * Report an uncaught render failure caught by the root error boundary.
 *
 * The component stack rides in `contexts.react`, the key Sentry's own React
 * integration uses. It is a list of component names — code, not user data — and
 * it survives the scrubber on purpose, because without it a white-screen report
 * says only that something rendered badly somewhere.
 */
export function reportRenderError(cause: unknown, componentStack: string | null): void {
  console.warn(formatSurfaceLog('render', 'uncaught render error'), cause);

  if (!TELEMETRY_ENABLED) return;

  Sentry.captureException(toReportable('render', 'uncaught render error', cause), {
    tags: { surface: 'render' },
    level: 'fatal',
    contexts: componentStack ? { react: { componentStack } } : undefined,
  });
}

function toReportable(surface: TelemetrySurface, message: string, cause: unknown): Error {
  const reportable = new Error(formatSurfaceLog(surface, message));

  // Retain code frames from a real Error, but discard its first stack line:
  // that line repeats the raw exception message and can contain a server echo.
  if (cause instanceof Error && cause.stack) {
    const frames = cause.stack.split('\n').slice(1).join('\n');
    if (frames) reportable.stack = `${reportable.name}: ${reportable.message}\n${frames}`;
  }

  return reportable;
}

/*
  ON GLOBAL HANDLERS — considered, and deliberately not hand-rolled.

  `@sentry/react-native` installs its own `ErrorUtils.setGlobalHandler` and its
  own unhandled-promise-rejection tracking as default integrations
  (`ReactNativeErrorHandlers`, on by default with `onerror` and
  `onunhandledrejection` both true), and it installs them chained in front of
  whatever handler was already registered. Adding a second
  `ErrorUtils.setGlobalHandler` here would either shadow Sentry's — the app's
  hard crashes stop being reported, which is the one thing this sprint exists
  for — or double-report every fatal. So the global handler is Sentry's, and
  when `TELEMETRY_ENABLED` is false there is none, exactly as before this sprint.
*/
