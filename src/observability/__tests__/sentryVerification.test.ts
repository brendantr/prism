import fs from 'node:fs';
import path from 'node:path';
import { shouldRenderSentryVerificationRoot } from '@/domain/sentryVerification';

const mockInit = jest.fn();
const mockCaptureException = jest.fn();
const mockClearBreadcrumbs = jest.fn();
const mockWithScope = jest.fn(
  (callback: (scope: { clearBreadcrumbs: () => void }) => unknown) =>
    callback({ clearBreadcrumbs: mockClearBreadcrumbs }),
);

jest.mock('@sentry/react-native', () => ({
  init: mockInit,
  captureException: mockCaptureException,
  withScope: mockWithScope,
}));

jest.mock('@/data/supabase/client', () => ({ DEMO_MODE: false }));

interface EasProfile {
  readonly extends?: string;
  readonly distribution?: string;
  readonly environment?: string;
  readonly env?: Record<string, string>;
}

const easConfig = JSON.parse(
  fs.readFileSync(path.resolve(process.cwd(), 'eas.json'), 'utf8'),
) as { build: Record<string, EasProfile> };
const layoutSource = fs.readFileSync(
  path.resolve(process.cwd(), 'app/_layout.tsx'),
  'utf8',
);

function listFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    return entry.isDirectory() ? listFiles(absolute) : [absolute];
  });
}

describe('verification-only root posture', () => {
  it('selects the verification root only for the exact literal flag', () => {
    expect(shouldRenderSentryVerificationRoot('true')).toBe(true);
    for (const value of [undefined, 'false', 'TRUE', '1', 'yes', '']) {
      expect(shouldRenderSentryVerificationRoot(value)).toBe(false);
    }
  });

  it('allows only the dedicated profile to enable the root', () => {
    const enabledProfiles = Object.entries(easConfig.build)
      .filter(([, profile]) =>
        shouldRenderSentryVerificationRoot(
          profile.env?.EXPO_PUBLIC_SENTRY_VERIFICATION_ENABLED,
        ),
      )
      .map(([name]) => name);

    expect(enabledProfiles).toEqual(['sentry-verification']);

    for (const profileName of ['development', 'preview', 'production']) {
      expect(
        easConfig.build[profileName]?.env?.EXPO_PUBLIC_SENTRY_VERIFICATION_ENABLED,
      ).toBe('false');
    }
  });

  it('keeps the dedicated artifact internal, production-backed, and free-first', () => {
    const profile = easConfig.build['sentry-verification'];

    expect(profile).toMatchObject({
      extends: 'production',
      distribution: 'internal',
      environment: 'production',
      env: {
        EXPO_PUBLIC_DEMO_MODE: 'false',
        EXPO_PUBLIC_MONETIZATION_ENABLED: 'false',
        EXPO_PUBLIC_EMAIL_RECOVERY_ENABLED: 'false',
        EXPO_PUBLIC_SENTRY_VERIFICATION_ENABLED: 'true',
      },
    });
  });

  it('uses the tested predicate at the named root boundary and registers no route', () => {
    expect(layoutSource).toMatch(
      /RENDER_SENTRY_VERIFICATION_ROOT\s*=\s*shouldRenderSentryVerificationRoot\(\s*process\.env\.EXPO_PUBLIC_SENTRY_VERIFICATION_ENABLED,?\s*\)/,
    );
    expect(layoutSource).toMatch(
      /RENDER_SENTRY_VERIFICATION_ROOT\s*\?\s*\(\s*<SentryVerificationRoot\s*\/>\s*\)\s*:\s*\(\s*<NormalAppRoot\s*\/>/,
    );

    const verificationRoutes = listFiles(path.resolve(process.cwd(), 'app'))
      .map((file) => path.relative(path.resolve(process.cwd(), 'app'), file))
      .filter((file) => /sentry.?verification/i.test(file));

    expect(verificationRoutes).toEqual([]);
    expect(layoutSource).not.toMatch(
      /<Stack\.Screen[^>]+name=["'][^"']*sentry.?verification/i,
    );
  });
});

const originalDev = __DEV__;

function setDevBundle(value: boolean): void {
  Object.defineProperty(globalThis, '__DEV__', {
    configurable: true,
    writable: true,
    value,
  });
}

function loadTelemetry(verificationFlag: string) {
  process.env.EXPO_PUBLIC_SENTRY_DSN = 'configured-for-test';
  process.env.EXPO_PUBLIC_SENTRY_VERIFICATION_ENABLED = verificationFlag;
  jest.resetModules();
  return require('../telemetry') as typeof import('../telemetry');
}

describe('controlled verification diagnostic', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setDevBundle(false);
  });

  afterAll(() => {
    delete process.env.EXPO_PUBLIC_SENTRY_DSN;
    delete process.env.EXPO_PUBLIC_SENTRY_VERIFICATION_ENABLED;
    setDevBundle(originalDev);
    jest.resetModules();
  });

  it('captures one fixed Error with no caller or capture-option data channel', () => {
    const telemetry = loadTelemetry('true');
    telemetry.initTelemetry();

    expect(telemetry.sendSentryVerificationDiagnostic).toHaveLength(0);
    telemetry.sendSentryVerificationDiagnostic();
    telemetry.sendSentryVerificationDiagnostic();

    expect(mockWithScope).toHaveBeenCalledTimes(1);
    expect(mockClearBreadcrumbs).toHaveBeenCalledTimes(1);
    expect(mockCaptureException).toHaveBeenCalledTimes(1);

    const captureArguments = mockCaptureException.mock.calls[0];
    expect(captureArguments).toHaveLength(1);
    expect(captureArguments?.[0]).toBeInstanceOf(Error);
    expect((captureArguments?.[0] as Error).message).toBe(
      'Repello controlled Sentry verification diagnostic',
    );
  });

  it('remains inert when a normal production profile pins the flag false', () => {
    const telemetry = loadTelemetry('false');
    telemetry.initTelemetry();
    telemetry.sendSentryVerificationDiagnostic();

    expect(mockInit).toHaveBeenCalledTimes(1);
    expect(mockWithScope).not.toHaveBeenCalled();
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it('remains inert in a development bundle even if the flag is unexpectedly true', () => {
    setDevBundle(true);
    const telemetry = loadTelemetry('true');
    telemetry.initTelemetry();
    telemetry.sendSentryVerificationDiagnostic();

    expect(mockInit).not.toHaveBeenCalled();
    expect(mockWithScope).not.toHaveBeenCalled();
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it('does not retry after an SDK capture failure', () => {
    mockCaptureException.mockImplementationOnce(() => {
      throw new Error('fixed test failure');
    });
    const telemetry = loadTelemetry('true');
    telemetry.initTelemetry();

    expect(() => telemetry.sendSentryVerificationDiagnostic()).not.toThrow();
    telemetry.sendSentryVerificationDiagnostic();

    expect(mockCaptureException).toHaveBeenCalledTimes(1);
  });
});
