import {
  bodyweightFieldValue,
  clampTrainingDays,
  isEmptyProfilePatch,
  parseBodyweight,
  planSelectionWrite,
  profilePatchFromOnboarding,
  routineWeekdays,
  selectActiveRoutine,
  toggleWeekday,
  validateDisplayName,
} from '../settings';
import type { Profile, Routine } from '../types';

const profile: Profile = {
  id: 'p1',
  displayName: 'Lifter',
  goal: 'strength',
  experience: 'intermediate',
  trainingDaysPerWeek: 4,
  preferredWeekdays: [1, 2, 4, 5],
  availableEquipment: ['barbell'],
  unit: 'kg',
  bodyweightKg: null,
  createdAt: '2026-08-01T00:00:00.000Z',
};

const routine = (id: string, daysPerWeek: number, profileId: string | null = null): Routine => ({
  id,
  profileId,
  name: id,
  description: '',
  daysPerWeek,
  isTemplate: profileId == null,
  isActive: false,
  days: [],
});

describe('settings rules', () => {
  it('prefers an owned active routine, then any owned routine, then the matching template', () => {
    const three = routine('three', 3);
    const four = routine('four', 4);
    const owned = routine('owned', 5, 'p1');
    expect(selectActiveRoutine([three, four], profile)?.id).toBe('four');
    expect(selectActiveRoutine([three, four, owned], profile)?.id).toBe('owned');
    expect(selectActiveRoutine([three, four, { ...owned, isActive: true }], profile)?.id).toBe('owned');
  });

  it('falls back deterministically by name when no profile or match exists', () => {
    expect(selectActiveRoutine([routine('Zulu', 6), routine('Alpha', 3)], null)?.id).toBe('Alpha');
    expect(selectActiveRoutine([], profile)).toBeNull();
  });

  it('stores shared-plan choice on the profile and owned-plan choice on the routine', () => {
    const shared = { ...routine('shared', 3), days: [{
      id: 'd1', routineId: 'shared', name: 'One', dayIndex: 0, weekday: 1, exercises: [],
    }, {
      id: 'd2', routineId: 'shared', name: 'Two', dayIndex: 1, weekday: 3, exercises: [],
    }, {
      id: 'd3', routineId: 'shared', name: 'Three', dayIndex: 2, weekday: 5, exercises: [],
    }] };
    expect(planSelectionWrite(shared)).toEqual({
      kind: 'profile',
      patch: { trainingDaysPerWeek: 3, preferredWeekdays: [1, 3, 5] },
    });
    expect(planSelectionWrite(routine('owned', 5, 'p1'))).toEqual({
      kind: 'activate', routineId: 'owned',
    });
  });

  it('uses weekdays only when every routine day is pinned', () => {
    const base = routine('r', 2);
    const days = [
      { id: 'd1', routineId: 'r', name: 'One', dayIndex: 0, weekday: 1, exercises: [] },
      { id: 'd2', routineId: 'r', name: 'Two', dayIndex: 1, weekday: 4, exercises: [] },
    ];
    expect(routineWeekdays({ ...base, days })).toEqual([1, 4]);
    expect(routineWeekdays({ ...base, days: [{ ...days[0], weekday: null }, days[1]] })).toBeNull();
  });

  it('parses display-unit bodyweight and supports clearing it', () => {
    expect(parseBodyweight('', 'kg')).toEqual({ ok: true, kg: null });
    expect(parseBodyweight('220,46', 'lb')).toEqual({ ok: true, kg: 100 });
    expect(parseBodyweight('0', 'kg')).toEqual({ ok: false });
    expect(bodyweightFieldValue(100, 'lb')).toBe('220.46');
  });

  it('normalises and bounds the display name to match migration 0002', () => {
    expect(validateDisplayName('  Ana   Lifter ')).toEqual({ ok: true, value: 'Ana Lifter' });
    expect(validateDisplayName('  ')).toEqual({ ok: false, problem: 'missing' });
    expect(validateDisplayName('x'.repeat(61))).toEqual({ ok: false, problem: 'too_long' });
  });

  it('keeps weekdays sorted and unique, and training days in schema range', () => {
    expect(toggleWeekday([5, 1], 3)).toEqual([1, 3, 5]);
    expect(toggleWeekday([1, 3, 5], 3)).toEqual([1, 5]);
    expect(clampTrainingDays(-2)).toBe(1);
    expect(clampTrainingDays(8.9)).toBe(7);
  });

  it('turns only answered onboarding questions into a profile patch', () => {
    expect(
      profilePatchFromOnboarding({
        goal: 'strength',
        experience: null,
        trainingDaysPerWeek: 3,
        availableEquipment: [],
      }),
    ).toEqual({ goal: 'strength', trainingDaysPerWeek: 3 });
    expect(
      isEmptyProfilePatch(
        profilePatchFromOnboarding({
          goal: null,
          experience: null,
          trainingDaysPerWeek: null,
          availableEquipment: [],
        }),
      ),
    ).toBe(true);
  });
});
