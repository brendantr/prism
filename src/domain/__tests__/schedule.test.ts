import { listTemplateChoices } from '../schedule';
import type { Routine, RoutineDay } from '@/domain/types';

function day(id: string, routineId: string, name: string): RoutineDay {
  return { id, routineId, name, dayIndex: 0, weekday: null, exercises: [] };
}

function routine(id: string, name: string, days: RoutineDay[]): Routine {
  return {
    id,
    profileId: null,
    name,
    description: '',
    daysPerWeek: days.length,
    isTemplate: true,
    isActive: false,
    days,
  };
}

describe('listTemplateChoices', () => {
  it('returns an empty list for no routines', () => {
    expect(listTemplateChoices([])).toEqual([]);
  });

  it('flattens every day across every routine, in routine/day order', () => {
    const a = routine('r_a', 'Spectrum 4', [day('r_a_d0', 'r_a', 'Lower'), day('r_a_d1', 'r_a', 'Upper')]);
    const b = routine('r_b', 'Prism 3', [day('r_b_d0', 'r_b', 'Full Body')]);

    const choices = listTemplateChoices([a, b]);

    expect(choices).toEqual([
      { routineId: 'r_a', routineName: 'Spectrum 4', day: a.days[0] },
      { routineId: 'r_a', routineName: 'Spectrum 4', day: a.days[1] },
      { routineId: 'r_b', routineName: 'Prism 3', day: b.days[0] },
    ]);
  });

  it('skips a routine with no days without erroring', () => {
    const empty = routine('r_empty', 'Empty', []);
    const withDays = routine('r_x', 'X', [day('r_x_d0', 'r_x', 'Day 1')]);

    expect(listTemplateChoices([empty, withDays])).toEqual([
      { routineId: 'r_x', routineName: 'X', day: withDays.days[0] },
    ]);
  });
});
