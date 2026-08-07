import { PASSWORD_MIN_LENGTH } from '../authValidation';
import {
  isResetBusy,
  isValidResetConfirm,
  isValidResetRequest,
  nextResetStage,
  validateResetConfirm,
  validateResetRequest,
  type ResetEvent,
  type ResetStage,
} from '../authReset';

/**
 * The reset stage machine and its field rules.
 *
 * Reset is the only flow in the app with two sequential server round trips, and
 * the second holds a value the first produced — a code typed in from an email.
 * Most of what is asserted below is about not losing that value.
 */

const ALL_STAGES: ResetStage[] = [
  'requestIdle',
  'requestSending',
  'requestDone',
  'codeIdle',
  'codeSending',
  'done',
];

const ALL_EVENTS: ResetEvent[] = [
  'requestStarted',
  'requestSucceeded',
  'requestFailed',
  'enterCode',
  'codeStarted',
  'codeSucceeded',
  'codeFailed',
  'startOver',
];

describe('nextResetStage', () => {
  it('walks the happy path end to end', () => {
    let stage: ResetStage = 'requestIdle';
    stage = nextResetStage(stage, 'requestStarted');
    expect(stage).toBe('requestSending');
    stage = nextResetStage(stage, 'requestSucceeded');
    expect(stage).toBe('requestDone');
    stage = nextResetStage(stage, 'enterCode');
    expect(stage).toBe('codeIdle');
    stage = nextResetStage(stage, 'codeStarted');
    expect(stage).toBe('codeSending');
    stage = nextResetStage(stage, 'codeSucceeded');
    expect(stage).toBe('done');
  });

  it('returns a failed request to the form, not past it', () => {
    // The address is still typed in. A network blip should cost one tap.
    expect(nextResetStage('requestSending', 'requestFailed')).toBe('requestIdle');
  });

  it('returns a failed code to the code form, NOT to the start', () => {
    /*
      The single most important transition here. Dropping to `requestIdle` would
      discard a code that is very likely still valid — a mistyped digit would
      cost a whole new email, and the lifter would reasonably assume the first
      code stopped working.
    */
    expect(nextResetStage('codeSending', 'codeFailed')).toBe('codeIdle');
  });

  it('lets the lifter start over from anywhere', () => {
    // The escape hatch for a genuinely expired code.
    for (const stage of ALL_STAGES) {
      expect(nextResetStage(stage, 'startOver')).toBe('requestIdle');
    }
  });

  it('ignores events that do not belong to the current stage', () => {
    // A late resolution arriving after the lifter moved on must not corrupt the
    // flow. Every unhandled pair is a no-op, never a throw.
    expect(nextResetStage('requestIdle', 'codeSucceeded')).toBe('requestIdle');
    expect(nextResetStage('codeIdle', 'requestSucceeded')).toBe('codeIdle');
    expect(nextResetStage('requestDone', 'codeFailed')).toBe('requestDone');
  });

  it('never throws and never leaves the known set, for any pair', () => {
    for (const stage of ALL_STAGES) {
      for (const event of ALL_EVENTS) {
        expect(ALL_STAGES).toContain(nextResetStage(stage, event));
      }
    }
  });

  it('treats done as terminal apart from starting over', () => {
    for (const event of ALL_EVENTS.filter((e) => e !== 'startOver')) {
      expect(nextResetStage('done', event)).toBe('done');
    }
  });
});

describe('isResetBusy', () => {
  it('is true exactly while a server call is outstanding', () => {
    expect(isResetBusy('requestSending')).toBe(true);
    expect(isResetBusy('codeSending')).toBe(true);
    for (const stage of ['requestIdle', 'requestDone', 'codeIdle', 'done'] as ResetStage[]) {
      expect(isResetBusy(stage)).toBe(false);
    }
  });
});

describe('validateResetRequest', () => {
  it('accepts an ordinary address', () => {
    const result = validateResetRequest('lifter@example.com');
    expect(isValidResetRequest(result)).toBe(true);
  });

  it('rejects an empty address before any network call', () => {
    expect(validateResetRequest('   ').email).toBe('email_required');
  });

  it('rejects something that is not an address', () => {
    expect(validateResetRequest('lifter-at-example').email).toBe('email_invalid');
  });

  it('uses the same address rule as sign-up, so the two cannot drift', () => {
    // Both accept a trimmed address with one @ and a dot in the domain.
    expect(isValidResetRequest(validateResetRequest('  a@b.co  '))).toBe(true);
  });
});

describe('validateResetConfirm', () => {
  const goodCode = '123456';
  const goodPassword = 'correct horse battery staple';

  it('accepts a six-digit code with a long enough password', () => {
    expect(isValidResetConfirm(validateResetConfirm(goodCode, goodPassword))).toBe(true);
  });

  it('rejects a missing code', () => {
    expect(validateResetConfirm('', goodPassword).token).toBe('code_required');
  });

  it('rejects a code of the wrong length', () => {
    expect(validateResetConfirm('12345', goodPassword).token).toBe('code_invalid');
    expect(validateResetConfirm('1234567', goodPassword).token).toBe('code_invalid');
  });

  it('rejects a non-numeric code', () => {
    expect(validateResetConfirm('12a456', goodPassword).token).toBe('code_invalid');
  });

  it('tolerates surrounding whitespace, because pasting picks it up', () => {
    expect(isValidResetConfirm(validateResetConfirm(' 123456 ', goodPassword))).toBe(true);
  });

  it('holds the new password to the same floor as sign-up', () => {
    /*
      A reset must not be a way to set a weaker password than the account could
      have been created with. The bound is imported rather than retyped so the
      two cannot drift.
    */
    const tooShort = 'a'.repeat(PASSWORD_MIN_LENGTH - 1);
    expect(validateResetConfirm(goodCode, tooShort).password).toBe('password_too_short');
    expect(
      validateResetConfirm(goodCode, 'a'.repeat(PASSWORD_MIN_LENGTH)).password,
    ).toBeUndefined();
  });

  it('reports both problems at once rather than one at a time', () => {
    // They are submitted together, so surfacing them one per attempt would be
    // two round trips through the same form for no reason.
    const result = validateResetConfirm('', '');
    expect(result.token).toBe('code_required');
    expect(result.password).toBe('password_required');
    expect(isValidResetConfirm(result)).toBe(false);
  });
});
