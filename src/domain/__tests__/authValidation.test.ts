import {
  PASSWORD_MIN_LENGTH,
  isValidCredentials,
  validateCredentials,
} from '../authValidation';

const EMAIL = 'lifter@example.com';
const LONG = 'correct horse battery staple'; // 28 chars

describe('credential validation', () => {
  describe('email', () => {
    it('is required, and whitespace is not an answer', () => {
      expect(validateCredentials('', LONG, 'signup').email).toBe('email_required');
      expect(validateCredentials('   ', LONG, 'signup').email).toBe('email_required');
    });

    it('rejects addresses missing an @ or a domain dot', () => {
      expect(validateCredentials('lifter.example.com', LONG, 'signup').email).toBe('email_invalid');
      expect(validateCredentials('lifter@example', LONG, 'signup').email).toBe('email_invalid');
      expect(validateCredentials('lif ter@example.com', LONG, 'signup').email).toBe('email_invalid');
    });

    it('accepts a padded address, since the padding is not the user’s intent', () => {
      expect(validateCredentials(`  ${EMAIL}  `, LONG, 'signup').email).toBeUndefined();
    });

    it('is required on sign-in too', () => {
      expect(validateCredentials('', 'anything', 'signin').email).toBe('email_required');
    });
  });

  describe('sign-up password: length only', () => {
    it('requires a password', () => {
      expect(validateCredentials(EMAIL, '', 'signup').password).toBe('password_required');
    });

    it(`rejects ${PASSWORD_MIN_LENGTH - 1} characters and accepts ${PASSWORD_MIN_LENGTH}`, () => {
      const short = 'a'.repeat(PASSWORD_MIN_LENGTH - 1);
      const exact = 'a'.repeat(PASSWORD_MIN_LENGTH);
      expect(validateCredentials(EMAIL, short, 'signup').password).toBe('password_too_short');
      expect(validateCredentials(EMAIL, exact, 'signup').password).toBeUndefined();
    });

    it('rejects the old eight-character minimum', () => {
      // Guards the policy change itself: 8 was previously enough.
      expect(validateCredentials(EMAIL, 'a'.repeat(8), 'signup').password).toBe(
        'password_too_short',
      );
    });

    it('imposes no composition rules', () => {
      // All lowercase, no digits, no symbols -- long enough is enough.
      expect(isValidCredentials(validateCredentials(EMAIL, LONG, 'signup'))).toBe(true);
      expect(
        isValidCredentials(validateCredentials(EMAIL, 'aaaaaaaaaaaaaaaa', 'signup')),
      ).toBe(true);
    });

    it('counts spaces and keeps case significant', () => {
      const spaced = 'a b c d e f g h'; // 15 chars including spaces
      expect(isValidCredentials(validateCredentials(EMAIL, spaced, 'signup'))).toBe(true);
      // Case is never normalised away: these are different passwords.
      expect(LONG.toUpperCase()).not.toBe(LONG);
    });

    it('does not trim the password, because padding may be part of it', () => {
      const padded = `  ${'a'.repeat(PASSWORD_MIN_LENGTH - 2)}  `;
      expect(validateCredentials(EMAIL, padded, 'signup').password).toBeUndefined();
    });
  });

  describe('sign-in password: presence only', () => {
    it('requires a password', () => {
      expect(validateCredentials(EMAIL, '', 'signin').password).toBe('password_required');
    });

    it('accepts a short legacy password that sign-up would now reject', () => {
      const legacy = 'abcd';
      expect(validateCredentials(EMAIL, legacy, 'signin').password).toBeUndefined();
      expect(validateCredentials(EMAIL, legacy, 'signup').password).toBe('password_too_short');
    });
  });

  describe('overall result', () => {
    it('is valid only when neither field has an error', () => {
      expect(isValidCredentials(validateCredentials(EMAIL, LONG, 'signup'))).toBe(true);
      expect(isValidCredentials(validateCredentials('', LONG, 'signup'))).toBe(false);
      expect(isValidCredentials(validateCredentials(EMAIL, '', 'signup'))).toBe(false);
      expect(isValidCredentials(validateCredentials('', '', 'signup'))).toBe(false);
    });
  });
});
