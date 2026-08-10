import {
  bodyweightChangeKg,
  draftFromMeasurement,
  latestMeasurement,
  measurementsNewestFirst,
  validateMeasurement,
} from '../measurements';
import type { BodyMeasurement } from '../types';

const identity = {
  id: 'm1',
  profileId: 'p1',
  measuredAt: '2026-08-09T12:00:00.000Z',
  unit: 'kg' as const,
};

const measurement = (id: string, measuredAt: string, bodyweightKg: number | null): BodyMeasurement => ({
  id,
  profileId: 'p1',
  measuredAt,
  bodyweightKg,
  bodyFatPct: null,
  circumferencesCm: {},
});

describe('body measurement rules', () => {
  it('parses optional values, comma decimals, and storage precision', () => {
    expect(
      validateMeasurement(
        { bodyweight: '82,456', bodyFatPct: '15.26', waistCm: '80.24' },
        identity,
      ),
    ).toEqual({
      ok: true,
      value: {
        id: 'm1',
        profileId: 'p1',
        measuredAt: identity.measuredAt,
        bodyweightKg: 82.46,
        bodyFatPct: 15.3,
        circumferencesCm: { waist: 80.2 },
      },
    });
  });

  it('converts pounds to kilograms before storage', () => {
    const result = validateMeasurement(
      { bodyweight: '220.46', bodyFatPct: '', waistCm: '' },
      { ...identity, unit: 'lb' },
    );
    expect(result.ok && result.value.bodyweightKg).toBeCloseTo(100, 1);
  });

  it.each([
    [{ bodyweight: '', bodyFatPct: '', waistCm: '' }, 'nothing_entered'],
    [{ bodyweight: '0', bodyFatPct: '', waistCm: '' }, 'bodyweight_invalid'],
    [{ bodyweight: 'abc', bodyFatPct: '', waistCm: '' }, 'bodyweight_invalid'],
    [{ bodyweight: '', bodyFatPct: '0.9', waistCm: '' }, 'body_fat_invalid'],
    [{ bodyweight: '', bodyFatPct: '71', waistCm: '' }, 'body_fat_invalid'],
    [{ bodyweight: '', bodyFatPct: '', waistCm: '301' }, 'waist_invalid'],
  ] as const)('rejects invalid measurement input', (draft, problem) => {
    expect(validateMeasurement(draft, identity)).toEqual({ ok: false, problem });
  });

  it('preserves circumference sites the form does not display', () => {
    const existing = {
      ...measurement('m1', identity.measuredAt, 80),
      circumferencesCm: { chest: 100, arm: 35, waist: 82 },
    };
    const result = validateMeasurement(
      { bodyweight: '80', bodyFatPct: '', waistCm: '81' },
      { ...identity, existing },
    );
    expect(result.ok && result.value.circumferencesCm).toEqual({ chest: 100, arm: 35, waist: 81 });
  });

  it('clears only the displayed waist site when its field is emptied', () => {
    const existing = {
      ...measurement('m1', identity.measuredAt, 80),
      circumferencesCm: { chest: 100, waist: 82 },
    };
    const result = validateMeasurement(
      { bodyweight: '80', bodyFatPct: '', waistCm: '' },
      { ...identity, existing },
    );
    expect(result.ok && result.value.circumferencesCm).toEqual({ chest: 100 });
  });

  it('loads a stored row in the chosen display unit', () => {
    expect(
      draftFromMeasurement(
        { ...measurement('m1', identity.measuredAt, 100), bodyFatPct: 15.5, circumferencesCm: { waist: 80 } },
        'lb',
      ),
    ).toEqual({ bodyweight: '220.46', bodyFatPct: '15.5', waistCm: '80' });
  });

  it('sorts newest first and computes change across entries that have a weight', () => {
    const all = [
      measurement('old', '2026-08-01T00:00:00.000Z', 80),
      measurement('waist-only', '2026-08-08T00:00:00.000Z', null),
      measurement('new', '2026-08-09T00:00:00.000Z', 82.25),
    ];
    expect(measurementsNewestFirst(all).map((entry) => entry.id)).toEqual(['new', 'waist-only', 'old']);
    expect(latestMeasurement(all)?.id).toBe('new');
    expect(bodyweightChangeKg(all)).toBe(2.25);
    expect(all.map((entry) => entry.id)).toEqual(['old', 'waist-only', 'new']);
  });
});
