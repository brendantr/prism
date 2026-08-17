import {
  CUSTOM_EXERCISE_PROBLEM,
  EXERCISE_COPY,
  MEASUREMENT_COPY,
  MEASUREMENT_PROBLEM,
  SETTINGS_COPY,
} from '../userData';

const STATIC_COPY = [
  ...Object.values(CUSTOM_EXERCISE_PROBLEM),
  ...Object.values(MEASUREMENT_PROBLEM),
  ...Object.values(SETTINGS_COPY).filter((value) => typeof value === 'string'),
  ...Object.values(EXERCISE_COPY).filter((value) => typeof value === 'string'),
  ...Object.values(MEASUREMENT_COPY).filter((value) => typeof value === 'string'),
];

describe('user-data copy', () => {
  it('contains no environment, credential, or schema language', () => {
    expect(STATIC_COPY.join(' ')).not.toMatch(
      /EXPO_PUBLIC_|SUPABASE|SERVICE_ROLE|API_KEY|SECRET|TOKEN|RLS|profile_id|postgres|foreign key|constraint/i,
    );
  });

  it('makes no medical, diagnostic, injury, or overtraining claim', () => {
    expect(STATIC_COPY.join(' ')).not.toMatch(/diagnos|clinical|medical|injur|overtrain|prevent/i);
  });

  it('states that measurement entry is optional and not an assessment', () => {
    expect(MEASUREMENT_COPY.explainer.toLowerCase()).toMatch(/optional/);
    expect(MEASUREMENT_COPY.explainer.toLowerCase()).toMatch(/does not interpret/);
    expect(MEASUREMENT_COPY.emptyBody.toLowerCase()).toMatch(/every field is optional/);
  });

  it('explains why an in-use movement is kept instead of promising deletion', () => {
    const message = EXERCISE_COPY.inUseMessage('My row', 2, 6).toLowerCase();
    expect(message).toMatch(/2 sessions/);
    expect(message).toMatch(/6 sets/);
    expect(message).toMatch(/history stays intact/);

    const fallback = EXERCISE_COPY.inUseFallbackMessage('My row').toLowerCase();
    expect(fallback).toMatch(/logged history/);
    expect(fallback).not.toMatch(/\b1 session\b|\b1 set\b/);
  });

  it('keeps a multi-write preference failure honest about possible partial progress', () => {
    expect(SETTINGS_COPY.failedMessage.toLowerCase()).toMatch(/may already be saved/);
    expect(SETTINGS_COPY.failedMessage.toLowerCase()).toMatch(/review/);
  });

  it('gives the privacy-policy control a clear label and destination', () => {
    expect(SETTINGS_COPY.privacyPolicyLabel).toBe('Privacy Policy');
    expect(SETTINGS_COPY.privacyPolicySubtitle).toMatch(/public policy/i);
    expect(SETTINGS_COPY.privacyPolicySubtitle).toMatch(/browser/i);
  });
});
