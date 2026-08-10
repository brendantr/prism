import {
  REDACTED_EMAIL,
  REDACTED_ID,
  REDACTED_QUERY,
  REDACTED_TOKEN,
  TELEMETRY_EVENT_FIELDS,
  formatSurfaceLog,
  redactSensitiveText,
  resolveTelemetryMode,
  scrubTelemetryBreadcrumb,
  scrubTelemetryEvent,
} from '../telemetry';

describe('resolveTelemetryMode', () => {
  const release = { dsn: 'https://abc@o1.ingest.example/2', demoMode: false, devBundle: false };

  it('enables only a release, non-demo build with a DSN', () => {
    expect(resolveTelemetryMode(release)).toEqual({ enabled: true, dsn: release.dsn });
    expect(resolveTelemetryMode({ ...release, dsn: '  ' })).toEqual({
      enabled: false,
      reason: 'noDsn',
    });
    expect(resolveTelemetryMode({ ...release, demoMode: true })).toEqual({
      enabled: false,
      reason: 'demoMode',
    });
    expect(resolveTelemetryMode({ ...release, devBundle: true })).toEqual({
      enabled: false,
      reason: 'devBundle',
    });
  });

  it('reports the structural reason first when more than one applies', () => {
    expect(resolveTelemetryMode({ dsn: '', demoMode: true, devBundle: true })).toEqual({
      enabled: false,
      reason: 'devBundle',
    });
  });
});

describe('redactSensitiveText', () => {
  it('redacts identifiers, secrets, and URL values', () => {
    const uuid = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0In0.dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1g';
    const scrubbed = redactSensitiveText(
      `lifter@example.com ${uuid} ${jwt} https://x.co/check_ins?id=${uuid}`,
    );

    expect(scrubbed).toContain(REDACTED_EMAIL);
    expect(scrubbed).toContain(REDACTED_ID);
    expect(scrubbed).toContain(REDACTED_TOKEN);
    expect(scrubbed).toContain(REDACTED_QUERY);
    expect(scrubbed).not.toContain('lifter@example.com');
    expect(scrubbed).not.toContain(uuid);
    expect(scrubbed).not.toContain('eyJ');
  });

  it('is idempotent', () => {
    const once = redactSensitiveText('a@b.co https://x.co/y?z=1');
    expect(redactSensitiveText(once)).toBe(once);
  });
});

describe('scrubTelemetryBreadcrumb', () => {
  it('keeps request metadata but drops bodies and URL values', () => {
    const breadcrumb = scrubTelemetryBreadcrumb({
      category: 'fetch',
      message: 'server echoed shoulder felt off',
      data: {
        method: 'POST',
        status_code: 409,
        url: 'https://x.co/rest/v1/workouts?profile_id=eq.3f2504e0-4f89-11d3-9a0c-0305e82c3301',
        request_body: { reflection: 'shoulder felt off' },
        response_body: 'weight was 102.5',
      },
    });

    expect(breadcrumb).toEqual({
      category: 'fetch',
      data: {
        method: 'POST',
        status_code: 409,
        url: `https://x.co/rest/v1/workouts?${REDACTED_QUERY}`,
      },
    });
  });

  it('drops console, click, and unknown breadcrumbs', () => {
    expect(scrubTelemetryBreadcrumb({ category: 'console', message: 'raw error' })).toBeNull();
    expect(scrubTelemetryBreadcrumb({ category: 'ui.click', message: 'Save' })).toBeNull();
    expect(scrubTelemetryBreadcrumb({ category: 'navigation', data: { to: 'account' } })).toBeNull();
    expect(scrubTelemetryBreadcrumb({ category: 'future.payload', data: { value: 82.5 } })).toBeNull();
  });
});

describe('scrubTelemetryEvent', () => {
  it('rebuilds an event from an allowlist and preserves actionable code evidence', () => {
    const event = {
      event_id: 'event-1',
      message: 'save failed for lifter@example.com at 102.5 kg',
      user: { id: '3f2504e0-4f89-11d3-9a0c-0305e82c3301' },
      request: { data: { reflection: 'shoulder felt off' } },
      extra: { entireStore: { sleep: 2 } },
      future_sdk_payload: { bodyweight: 82.5 },
      tags: { surface: 'workout', userEmail: 'lifter@example.com' },
      contexts: {
        app: { app_version: '1.0.0', unexpected: 'shoulder felt off' },
        device: { model: 'iPhone17,1', name: "Brendan's iPhone" },
        os: { name: 'iOS', version: '26.0' },
        state: { workouts: [{ reflection: 'shoulder felt off' }] },
      },
      breadcrumbs: [
        { category: 'console', message: 'shoulder felt off' },
        {
          category: 'xhr',
          data: { url: 'https://x.co/rest/v1/workouts?weight=102.5', status_code: 500 },
        },
      ],
      exception: {
        values: [
          {
            type: 'Error',
            value: 'server echoed shoulder felt off at 102.5 kg',
            stacktrace: {
              frames: [
                {
                  filename: 'app:///src/store/trainingStore.ts',
                  function: 'refresh',
                  lineno: 104,
                  vars: { reflection: 'shoulder felt off' },
                },
              ],
            },
          },
        ],
      },
    };

    const scrubbed = scrubTelemetryEvent(event);
    const serialised = JSON.stringify(scrubbed);

    expect(Object.keys(scrubbed).every((key) => TELEMETRY_EVENT_FIELDS.includes(key as never))).toBe(true);
    expect(scrubbed.tags).toEqual({ surface: 'workout' });
    expect(serialised).not.toContain('shoulder felt off');
    expect(serialised).not.toContain('102.5');
    expect(serialised).not.toContain('lifter@example.com');
    expect(serialised).not.toContain("Brendan's iPhone");
    expect(serialised).toContain('app:///src/store/trainingStore.ts');
    expect(serialised).toContain('500');
    expect(serialised).toContain('Application error');
  });

  it('does not mutate the source event', () => {
    const original = { user: { email: 'lifter@example.com' }, message: 'raw' };
    scrubTelemetryEvent(original);
    expect(original).toEqual({ user: { email: 'lifter@example.com' }, message: 'raw' });
  });
});

describe('formatSurfaceLog', () => {
  it('keeps the existing local warning convention', () => {
    expect(formatSurfaceLog('check-in', 'save failed')).toBe('[check-in] save failed');
  });
});
