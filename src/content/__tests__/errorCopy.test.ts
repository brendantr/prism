import { APP_ERROR } from '../errors';

/**
 * Copy as policy, same posture as `accountCopy.test.ts` and `authCopy.test.ts`.
 *
 * The crash screen is the surface with the strongest pull toward printing the
 * underlying error — it is the one moment where a developer most wants the
 * detail and a lifter least benefits from it. These assertions are what stop
 * that from being a one-line change later.
 */

const ALL_COPY = [
  APP_ERROR.eyebrow,
  APP_ERROR.title,
  APP_ERROR.body,
  APP_ERROR.retryLabel,
  APP_ERROR.reportSentNote,
  APP_ERROR.reportNotSentNote,
].join(' ');

describe('app error copy', () => {
  it('names no environment variable, credential, or internal identifier', () => {
    // I-4/I-5.
    expect(ALL_COPY).not.toMatch(/EXPO_PUBLIC_/);
    expect(ALL_COPY).not.toMatch(/SUPABASE|supabase|SENTRY|sentry/);
    expect(ALL_COPY).not.toMatch(/ANON_KEY|SERVICE_ROLE|API_KEY|SECRET|TOKEN|DSN/);
    expect(ALL_COPY).not.toMatch(/auth\/v1|\bRLS\b|profile_id|postgres|keychain/i);
  });

  it('makes no medical, diagnostic, or clinical claim', () => {
    // I-8. Worth pinning here specifically: "recover" is a word PRism uses
    // about training, and a crash screen is where it would slip in meaning
    // something else entirely.
    expect(ALL_COPY).not.toMatch(/diagnos|clinical|medical|injur|overtrain|prevent/i);
  });

  it('claims nothing about deletion, export, or the account', () => {
    // A render failure is not an account event. The words that describe one
    // would be read as though it were — the same reason the sign-out copy is
    // constrained (I-10).
    expect(ALL_COPY).not.toMatch(/delete|erase|export|wipe|permanently|your account/i);
  });

  it('exposes no error detail, code, or stack vocabulary', () => {
    expect(ALL_COPY).not.toMatch(/stack|exception|undefined is not|TypeError|error code|\b\d{3}\b/);
  });

  it('says plainly what a crash report does and does not contain', () => {
    // The transparency claim the fallback screen makes must stay honest, and
    // it is only honest while `scrubTelemetryEvent` keeps training data out.
    // `src/domain/__tests__/telemetry.test.ts` is the other half of this pair.
    expect(APP_ERROR.reportSentNote).toMatch(/not your training/i);
    expect(APP_ERROR.reportSentNote).toMatch(/may send/i);
    expect(APP_ERROR.reportNotSentNote).toMatch(/did not send/i);
  });
});
