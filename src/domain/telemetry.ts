/** Pure crash-reporting policy. The Sentry boundary lives in `src/observability`. */

export type TelemetryDisabledReason = 'devBundle' | 'demoMode' | 'noDsn';

export type TelemetryMode =
  | { readonly enabled: true; readonly dsn: string }
  | { readonly enabled: false; readonly reason: TelemetryDisabledReason };

export interface TelemetryEnvironment {
  readonly dsn: string | null | undefined;
  readonly demoMode: boolean;
  readonly devBundle: boolean;
}

export function resolveTelemetryMode(env: TelemetryEnvironment): TelemetryMode {
  if (env.devBundle) return { enabled: false, reason: 'devBundle' };
  if (env.demoMode) return { enabled: false, reason: 'demoMode' };

  const dsn = typeof env.dsn === 'string' ? env.dsn.trim() : '';
  return dsn ? { enabled: true, dsn } : { enabled: false, reason: 'noDsn' };
}

export const REDACTED_EMAIL = '[redacted-email]';
export const REDACTED_ID = '[redacted-id]';
export const REDACTED_TOKEN = '[redacted-token]';
export const REDACTED_QUERY = '[redacted-query]';

const URL_QUERY = /(https?:\/\/[^\s"'<>]*?)([?#])[^\s"'<>]*/gi;
const JWT = /\beyJ[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]*/g;
const NAMED_SECRET =
  /\b(bearer|apikey|api[_-]?key|access[_-]?token|refresh[_-]?token|authorization)([=:]\s*|\s+)([A-Za-z0-9._~+/=-]{8,})/gi;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z0-9.-]+/g;
const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;

export function redactSensitiveText(value: string): string {
  return value
    .replace(URL_QUERY, `$1$2${REDACTED_QUERY}`)
    .replace(JWT, REDACTED_TOKEN)
    .replace(NAMED_SECRET, `$1$2${REDACTED_TOKEN}`)
    .replace(EMAIL, REDACTED_EMAIL)
    .replace(UUID, REDACTED_ID);
}

type Json = Record<string, unknown>;

function isRecord(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function redactDeep(value: unknown, depth = 0): unknown {
  if (depth > 12) return undefined;
  if (typeof value === 'string') return redactSensitiveText(value);
  if (Array.isArray(value)) return value.map((item) => redactDeep(item, depth + 1));
  if (!isRecord(value)) return value;

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, redactDeep(item, depth + 1)]),
  );
}

const NETWORK_BREADCRUMB_CATEGORIES = new Set(['fetch', 'http', 'xhr']);
const BREADCRUMB_BASE_FIELDS = ['category', 'level', 'timestamp', 'type'] as const;
const NETWORK_DATA_FIELDS = ['method', 'status_code', 'url'] as const;

function pick(source: Json, keys: readonly string[]): Json {
  const result: Json = {};
  for (const key of keys) {
    if (source[key] !== undefined) result[key] = source[key];
  }
  return result;
}

/**
 * Keep only request metadata. Console arguments, navigation/click trails,
 * request bodies, and response bodies never enter an outbound breadcrumb.
 */
export function scrubTelemetryBreadcrumb<T extends Json>(breadcrumb: T): T | null {
  const category = typeof breadcrumb.category === 'string' ? breadcrumb.category : '';
  const network = NETWORK_BREADCRUMB_CATEGORIES.has(category);
  if (!network) return null;

  const safe = pick(breadcrumb, BREADCRUMB_BASE_FIELDS);
  if (isRecord(breadcrumb.data)) {
    safe.data = pick(breadcrumb.data, NETWORK_DATA_FIELDS);
  }

  return redactDeep(safe) as T;
}

const CONTEXT_FIELDS: Record<string, readonly string[]> = {
  app: [
    'app_build',
    'app_identifier',
    'app_name',
    'app_start_time',
    'app_version',
    'build_type',
    'in_foreground',
  ],
  device: [
    'arch',
    'battery_level',
    'charging',
    'family',
    'free_memory',
    'memory_size',
    'model',
    'model_id',
    'simulator',
    'usable_memory',
  ],
  os: ['build', 'kernel_version', 'name', 'rooted', 'version'],
  react: ['componentStack'],
};

function scrubContexts(value: unknown): Json | undefined {
  if (!isRecord(value)) return undefined;
  const contexts: Json = {};
  for (const [name, fields] of Object.entries(CONTEXT_FIELDS)) {
    if (isRecord(value[name])) contexts[name] = pick(value[name], fields);
  }
  return redactDeep(contexts) as Json;
}

function scrubStacktrace(value: unknown): Json | undefined {
  if (!isRecord(value)) return undefined;
  const safe = pick(value, ['frames', 'frames_omitted']);
  if (Array.isArray(safe.frames)) {
    safe.frames = safe.frames.map((frame) => {
      if (!isRecord(frame)) return {};
      const withoutRuntimeValues = { ...frame };
      delete withoutRuntimeValues.vars;
      return withoutRuntimeValues;
    });
  }
  return redactDeep(safe) as Json;
}

function scrubException(value: unknown): Json | undefined {
  if (!isRecord(value) || !Array.isArray(value.values)) return undefined;

  const values = value.values.map((entry) => {
    if (!isRecord(entry)) return { type: 'Error', value: 'Application error' };
    const safe: Json = {
      type: 'Error',
      // Exception messages can contain arbitrary server echoes or user-entered
      // values. Stack frames and the closed surface tag carry the useful signal.
      value: 'Application error',
    };
    const stacktrace = scrubStacktrace(entry.stacktrace);
    if (stacktrace) safe.stacktrace = stacktrace;
    if (isRecord(entry.mechanism)) {
      safe.mechanism = pick(entry.mechanism, ['handled', 'synthetic', 'type']);
    }
    return safe;
  });

  return { values };
}

export const TELEMETRY_EVENT_FIELDS = [
  'breadcrumbs',
  'contexts',
  'debug_meta',
  'dist',
  'environment',
  'event_id',
  'exception',
  'level',
  'modules',
  'platform',
  'release',
  'sdk',
  'tags',
  'timestamp',
] as const;

/**
 * Outbound events are rebuilt from an allowlist. Unknown future SDK fields are
 * excluded by default, so adding a new payload carrier cannot silently widen
 * the privacy boundary.
 */
export function scrubTelemetryEvent<T extends Json>(event: T): T {
  const safe = pick(event, TELEMETRY_EVENT_FIELDS);

  const contexts = scrubContexts(event.contexts);
  if (contexts) safe.contexts = contexts;

  if (Array.isArray(event.breadcrumbs)) {
    safe.breadcrumbs = event.breadcrumbs
      .filter(isRecord)
      .map((breadcrumb) => scrubTelemetryBreadcrumb(breadcrumb))
      .filter((breadcrumb): breadcrumb is Json => breadcrumb !== null);
  }

  const exception = scrubException(event.exception);
  if (exception) safe.exception = exception;

  // `surface` is a closed union at the call site. No arbitrary tags survive.
  safe.tags =
    isRecord(event.tags) && typeof event.tags.surface === 'string'
      ? { surface: redactSensitiveText(event.tags.surface).slice(0, 40) }
      : {};

  return redactDeep(safe) as T;
}

export type TelemetrySurface = 'check-in' | 'account' | 'summary' | 'workout' | 'render';

export function formatSurfaceLog(surface: TelemetrySurface, message: string): string {
  return `[${surface}] ${message}`;
}
