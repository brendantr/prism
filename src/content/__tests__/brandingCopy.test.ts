import * as account from '../account';
import * as errors from '../errors';
import * as onboarding from '../onboarding';
import * as paywall from '../paywall';
import * as social from '../social';
import * as userData from '../userData';
import * as zeroData from '../zeroData';

function collectStrings(value: unknown, seen = new WeakSet<object>()): string[] {
  if (value === null) return ['null'];
  if (value === undefined) return ['undefined'];

  switch (typeof value) {
    case 'string':
    case 'number':
    case 'boolean':
    case 'bigint':
    case 'symbol':
      return [String(value)];
    case 'function':
      return [Function.prototype.toString.call(value)];
    case 'object':
      if (seen.has(value)) return [];
      seen.add(value);
      return Array.isArray(value)
        ? value.flatMap((entry) => collectStrings(entry, seen))
        : Object.entries(value).flatMap(([key, entry]) => [
            key,
            ...collectStrings(entry, seen),
          ]);
    default:
      return [String(value)];
  }
}

const CUSTOMER_COPY = collectStrings({
  account,
  errors,
  onboarding,
  paywall,
  social,
  userData,
  zeroData,
}).join(' ');

describe('customer-facing product name', () => {
  it('collects literal and function-valued strings recursively', () => {
    const strings = collectStrings({
      nullable: null,
      missing: undefined,
      primitive: 7,
      literal: 'PRism',
      generated: () => 'PRism',
      nested: ['Repello'],
    });

    expect(strings).toEqual(
      expect.arrayContaining(['null', 'undefined', '7', 'PRism', 'Repello']),
    );
    expect(strings.some((entry) => entry.includes("() => 'PRism'"))).toBe(true);
  });

  it('uses Repello and exposes no former product name in centralized copy', () => {
    expect(CUSTOMER_COPY).toContain('Repello');
    expect(CUSTOMER_COPY).not.toMatch(/\bPRism\b|\bPrism\b/);
  });
});
