import { deviceLocalDate, isLocalDate, localDateAtOffset } from '../trainingDay';

describe('localDateAtOffset', () => {
  it('keeps adjacent Eastern local dates distinct even when UTC calls both Tuesday', () => {
    expect(localDateAtOffset('2026-03-03T03:30:00.000Z', -4 * 60)).toBe('2026-03-02');
    expect(localDateAtOffset('2026-03-03T04:30:00.000Z', -4 * 60)).toBe('2026-03-03');
  });

  it('keeps one Sydney local date together when UTC splits it across two dates', () => {
    expect(localDateAtOffset('2026-03-01T22:00:00.000Z', 10 * 60)).toBe('2026-03-02');
    expect(localDateAtOffset('2026-03-02T08:00:00.000Z', 10 * 60)).toBe('2026-03-02');
  });

  it('puts the UTC-5 agreement boundary at 19:00 local', () => {
    expect(localDateAtOffset('2026-01-05T23:59:00.000Z', -5 * 60)).toBe('2026-01-05');
    expect(localDateAtOffset('2026-01-06T00:00:00.000Z', -5 * 60)).toBe('2026-01-05');
  });

  it('puts the UTC+10 agreement boundary at 10:00 local', () => {
    expect(localDateAtOffset('2026-01-04T23:59:00.000Z', 10 * 60)).toBe('2026-01-05');
    expect(localDateAtOffset('2026-01-05T00:00:00.000Z', 10 * 60)).toBe('2026-01-05');
  });

  it('handles a non-integral offset without rounding the date boundary', () => {
    expect(localDateAtOffset('2026-01-01T18:29:00.000Z', 5 * 60 + 30)).toBe('2026-01-01');
    expect(localDateAtOffset('2026-01-01T18:30:00.000Z', 5 * 60 + 30)).toBe('2026-01-02');
  });

  it('allows travel to repeat a local date', () => {
    expect(localDateAtOffset('2026-03-01T10:30:00.000Z', 14 * 60)).toBe('2026-03-02');
    expect(localDateAtOffset('2026-03-02T12:30:00.000Z', -12 * 60)).toBe('2026-03-02');
  });

  it('allows travel to skip a local date', () => {
    expect(localDateAtOffset('2026-03-01T10:30:00.000Z', -12 * 60)).toBe('2026-02-28');
    expect(localDateAtOffset('2026-03-01T12:30:00.000Z', 14 * 60)).toBe('2026-03-02');
  });

  it('keeps both sides of the autumn DST fold on one date', () => {
    expect(localDateAtOffset('2026-11-01T05:30:00.000Z', -4 * 60)).toBe('2026-11-01');
    expect(localDateAtOffset('2026-11-01T06:30:00.000Z', -5 * 60)).toBe('2026-11-01');
  });

  it('keeps both sides of the spring DST gap on one date', () => {
    expect(localDateAtOffset('2026-03-08T06:30:00.000Z', -5 * 60)).toBe('2026-03-08');
    expect(localDateAtOffset('2026-03-08T07:30:00.000Z', -4 * 60)).toBe('2026-03-08');
  });

  it('rejects invalid instants and offsets', () => {
    expect(() => localDateAtOffset('not-a-date', 0)).toThrow(RangeError);
    expect(() => localDateAtOffset('2026-01-01T00:00:00.000Z', Number.NaN)).toThrow(RangeError);
  });
});

describe('deviceLocalDate', () => {
  it('matches the device calendar getters for the same instant', () => {
    const at = new Date('2026-04-05T12:34:56.000Z');
    const expected = [
      String(at.getFullYear()).padStart(4, '0'),
      String(at.getMonth() + 1).padStart(2, '0'),
      String(at.getDate()).padStart(2, '0'),
    ].join('-');
    expect(deviceLocalDate(at)).toBe(expected);
  });
});

describe('isLocalDate', () => {
  it('accepts real strict dates and rejects normalized or impossible ones', () => {
    expect(isLocalDate('2026-02-28')).toBe(true);
    expect(isLocalDate('2024-02-29')).toBe(true);
    expect(isLocalDate('2026-2-8')).toBe(false);
    expect(isLocalDate('2026-02-29')).toBe(false);
    expect(isLocalDate('2026-04-31')).toBe(false);
  });
});
