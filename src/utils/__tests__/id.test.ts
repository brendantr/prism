/**
 * These ids become Postgres primary keys, so two properties have to hold and
 * keep holding: they parse as UUID v4, and they come from a cryptographically
 * secure source rather than `Math.random()`.
 *
 * `jest-expo` stubs expo-crypto's native module -- the real `randomUUID()`
 * returns `undefined` under this preset -- so the suite substitutes Node's
 * CSPRNG. That means the entropy of the *device* generator is not what is being
 * measured here, and this file does not pretend otherwise. What it does pin
 * down is the regression that matters: that `newId` delegates to the platform
 * CSPRNG at all. A silent return to `Math.random()` fails the delegation test
 * below.
 */

import { randomUUID as nodeRandomUUID } from 'node:crypto';

const mockRandomUUID = jest.fn(() => nodeRandomUUID());

jest.mock('expo-crypto', () => ({ randomUUID: () => mockRandomUUID() }));

import { newId } from '../id';
import * as Crypto from 'expo-crypto';

/** RFC 4122 v4: version nibble is `4`, variant nibble is one of 8/9/a/b. */
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

beforeEach(() => mockRandomUUID.mockClear());

describe('newId', () => {
  it('sources every id from the platform CSPRNG', () => {
    // The security-relevant assertion. `Math.random()` cannot satisfy it.
    newId();
    newId('wk');

    expect(Crypto.randomUUID).toBeDefined();
    expect(mockRandomUUID).toHaveBeenCalledTimes(2);
  });

  it('returns a well-formed UUID v4', () => {
    // Dropping straight into a Postgres `uuid` column means the shape is not
    // cosmetic -- a malformed id fails at the database, mid-workout.
    for (let i = 0; i < 100; i++) {
      expect(newId()).toMatch(UUID_V4);
    }
  });

  it('ignores the prefix argument, which is documentation for the call site', () => {
    expect(newId('ci')).toMatch(UUID_V4);
    expect(newId('ci')).not.toContain('ci');
  });

  it('does not repeat across a large batch', () => {
    const ids = new Set(Array.from({ length: 10_000 }, () => newId()));
    expect(ids.size).toBe(10_000);
  });
});
