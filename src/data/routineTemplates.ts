import type { Routine, RoutineDay, RoutineExercise } from '@/domain/types';

/**
 * PRism template plans. Original programming, written for this app.
 *
 * Templates live in the same shape as user routines so "start from a template"
 * is a clone, not a special case.
 */

interface SlotSpec {
  exerciseId: string;
  sets: number;
  reps: [number, number];
  rpe?: number;
  rest: number;
}

function buildDay(
  routineId: string,
  dayIndex: number,
  name: string,
  weekday: number | null,
  slots: SlotSpec[],
): RoutineDay {
  const id = `${routineId}_d${dayIndex}`;
  const exercises: RoutineExercise[] = slots.map((slot, i) => ({
    id: `${id}_x${i}`,
    routineDayId: id,
    exerciseId: slot.exerciseId,
    orderIndex: i,
    targetSets: slot.sets,
    targetRepsLow: slot.reps[0],
    targetRepsHigh: slot.reps[1],
    targetRpe: slot.rpe ?? null,
    restSeconds: slot.rest,
  }));
  return { id, routineId, name, dayIndex, weekday, exercises };
}

const SPLIT_ID = 'rt_spectrum_4';

/**
 * "Spectrum 4" -- PRism's default four-day upper/lower rotation.
 * Two lower days split by pattern (squat / hinge), two upper days split by
 * plane (press / pull), so nothing gets hit twice inside 48 hours.
 */
export const SPECTRUM_FOUR: Routine = {
  id: SPLIT_ID,
  profileId: null,
  name: 'Spectrum 4',
  description:
    'Four days, upper/lower, split by movement pattern so no muscle sees two hard sessions inside 48 hours. Built for lifters who want steady load progression without living in the gym.',
  daysPerWeek: 4,
  isTemplate: true,
  days: [
    buildDay(SPLIT_ID, 0, 'Lower — Squat', 1, [
      { exerciseId: 'ex_back_squat', sets: 4, reps: [5, 8], rpe: 8, rest: 180 },
      { exerciseId: 'ex_rdl', sets: 3, reps: [8, 10], rpe: 8, rest: 150 },
      { exerciseId: 'ex_leg_press', sets: 3, reps: [10, 12], rpe: 8.5, rest: 120 },
      { exerciseId: 'ex_leg_curl', sets: 3, reps: [10, 15], rpe: 9, rest: 90 },
      { exerciseId: 'ex_standing_calf', sets: 4, reps: [8, 12], rpe: 9, rest: 75 },
      { exerciseId: 'ex_hanging_raise', sets: 3, reps: [8, 15], rest: 60 },
    ]),
    buildDay(SPLIT_ID, 1, 'Upper — Press', 2, [
      { exerciseId: 'ex_bench_press', sets: 4, reps: [5, 8], rpe: 8, rest: 180 },
      { exerciseId: 'ex_barbell_row', sets: 4, reps: [6, 10], rpe: 8, rest: 150 },
      { exerciseId: 'ex_db_shoulder_press', sets: 3, reps: [8, 12], rpe: 8.5, rest: 120 },
      { exerciseId: 'ex_lat_pulldown', sets: 3, reps: [10, 12], rpe: 8.5, rest: 105 },
      { exerciseId: 'ex_lateral_raise', sets: 3, reps: [12, 20], rpe: 9, rest: 60 },
      { exerciseId: 'ex_pushdown', sets: 3, reps: [10, 15], rpe: 9, rest: 60 },
    ]),
    buildDay(SPLIT_ID, 2, 'Lower — Hinge', 4, [
      { exerciseId: 'ex_deadlift', sets: 3, reps: [3, 5], rpe: 8, rest: 210 },
      { exerciseId: 'ex_bulgarian_split', sets: 3, reps: [8, 12], rpe: 8.5, rest: 120 },
      { exerciseId: 'ex_hip_thrust', sets: 3, reps: [8, 12], rpe: 8.5, rest: 120 },
      { exerciseId: 'ex_leg_extension', sets: 3, reps: [12, 15], rpe: 9, rest: 75 },
      { exerciseId: 'ex_seated_calf', sets: 4, reps: [10, 15], rpe: 9, rest: 60 },
    ]),
    buildDay(SPLIT_ID, 3, 'Upper — Pull', 5, [
      { exerciseId: 'ex_pullup', sets: 4, reps: [5, 10], rpe: 8, rest: 180 },
      { exerciseId: 'ex_db_incline', sets: 4, reps: [8, 12], rpe: 8, rest: 150 },
      { exerciseId: 'ex_cable_row', sets: 3, reps: [10, 12], rpe: 8.5, rest: 120 },
      { exerciseId: 'ex_face_pull', sets: 3, reps: [15, 20], rpe: 8, rest: 60 },
      { exerciseId: 'ex_incline_curl', sets: 3, reps: [10, 12], rpe: 9, rest: 75 },
      { exerciseId: 'ex_overhead_ext', sets: 3, reps: [10, 15], rpe: 9, rest: 60 },
    ]),
  ],
};

const FULL_ID = 'rt_prism_3';

/** "Prism 3" -- three full-body days for lifters with less time. */
export const PRISM_THREE: Routine = {
  id: FULL_ID,
  profileId: null,
  name: 'Prism 3',
  description:
    'Three full-body sessions a week. Every session has one squat, one hinge, one push and one pull, rotating the heavy slot so each pattern gets a hard day every week.',
  daysPerWeek: 3,
  isTemplate: true,
  days: [
    buildDay(FULL_ID, 0, 'Full Body — Squat Lead', 1, [
      { exerciseId: 'ex_back_squat', sets: 4, reps: [5, 8], rpe: 8, rest: 180 },
      { exerciseId: 'ex_bench_press', sets: 3, reps: [6, 10], rpe: 8, rest: 150 },
      { exerciseId: 'ex_cable_row', sets: 3, reps: [10, 12], rpe: 8.5, rest: 120 },
      { exerciseId: 'ex_leg_curl', sets: 3, reps: [10, 15], rpe: 9, rest: 90 },
      { exerciseId: 'ex_lateral_raise', sets: 3, reps: [12, 20], rpe: 9, rest: 60 },
    ]),
    buildDay(FULL_ID, 1, 'Full Body — Hinge Lead', 3, [
      { exerciseId: 'ex_rdl', sets: 4, reps: [6, 10], rpe: 8, rest: 180 },
      { exerciseId: 'ex_pullup', sets: 4, reps: [5, 10], rpe: 8, rest: 150 },
      { exerciseId: 'ex_db_shoulder_press', sets: 3, reps: [8, 12], rpe: 8.5, rest: 120 },
      { exerciseId: 'ex_leg_press', sets: 3, reps: [10, 15], rpe: 8.5, rest: 120 },
      { exerciseId: 'ex_cable_curl', sets: 3, reps: [10, 15], rpe: 9, rest: 60 },
    ]),
    buildDay(FULL_ID, 2, 'Full Body — Press Lead', 5, [
      { exerciseId: 'ex_ohp', sets: 4, reps: [5, 8], rpe: 8, rest: 180 },
      { exerciseId: 'ex_front_squat', sets: 3, reps: [6, 10], rpe: 8, rest: 180 },
      { exerciseId: 'ex_chest_supported_row', sets: 3, reps: [10, 12], rpe: 8.5, rest: 120 },
      { exerciseId: 'ex_hip_thrust', sets: 3, reps: [8, 12], rpe: 8.5, rest: 120 },
      { exerciseId: 'ex_pushdown', sets: 3, reps: [10, 15], rpe: 9, rest: 60 },
    ]),
  ],
};

export const ROUTINE_TEMPLATES: Routine[] = [SPECTRUM_FOUR, PRISM_THREE];

export function findRoutineDay(routine: Routine, dayId: string): RoutineDay | undefined {
  return routine.days.find((d) => d.id === dayId);
}
