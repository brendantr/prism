import {
  canEditExercise,
  customExercises,
  draftFromExercise,
  emptyExerciseDraft,
  exerciseUsage,
  validateCustomExercise,
  type CustomExerciseDraft,
  type CustomExerciseProblem,
} from '../customExercise';
import type { Exercise, Workout } from '../types';

const custom: Exercise = {
  id: 'custom',
  name: 'Cable Press',
  equipment: 'cable',
  primaryMuscles: ['chest'],
  secondaryMuscles: ['triceps'],
  isUnilateral: true,
  isSystem: false,
  cue: 'Reach forward',
};

describe('custom exercise rules', () => {
  it('starts with a required equipment answer and no invented muscles', () => {
    expect(emptyExerciseDraft()).toEqual({
      name: '',
      equipment: 'barbell',
      primaryMuscles: [],
      secondaryMuscles: [],
      isUnilateral: false,
      cue: '',
    });
  });

  it('normalises whitespace and canonicalises muscle order', () => {
    const result = validateCustomExercise({
      name: '  My   row  ',
      equipment: 'cable',
      primaryMuscles: ['biceps', 'lats', 'biceps'],
      secondaryMuscles: ['forearms', 'rear_delts'],
      isUnilateral: true,
      cue: '  Keep the cable close.  ',
    });
    expect(result).toEqual({
      ok: true,
      value: {
        name: 'My row',
        equipment: 'cable',
        primaryMuscles: ['lats', 'biceps'],
        secondaryMuscles: ['rear_delts', 'forearms'],
        isUnilateral: true,
        cue: 'Keep the cable close.',
      },
    });
  });

  const invalidCases: Array<[CustomExerciseDraft, CustomExerciseProblem]> = [
    [{ ...emptyExerciseDraft(), name: '   ' }, 'name_missing'],
    [{ ...emptyExerciseDraft(), name: 'x'.repeat(61), primaryMuscles: ['chest'] }, 'name_too_long'],
    [{ ...emptyExerciseDraft(), name: 'Press' }, 'primary_muscle_missing'],
    [
      {
        ...emptyExerciseDraft(),
        name: 'Press',
        primaryMuscles: ['chest'],
        secondaryMuscles: ['chest'],
      },
      'muscle_in_both',
    ],
    [
      {
        ...emptyExerciseDraft(),
        name: 'Press',
        primaryMuscles: ['chest'],
        cue: 'x'.repeat(201),
      },
      'cue_too_long',
    ],
  ];

  it.each(invalidCases)('rejects invalid input with %s', (draft, problem) => {
    expect(validateCustomExercise(draft)).toEqual({ ok: false, problem });
  });

  it('round-trips an editable exercise into the form shape', () => {
    expect(draftFromExercise(custom)).toEqual({
      name: 'Cable Press',
      equipment: 'cable',
      primaryMuscles: ['chest'],
      secondaryMuscles: ['triceps'],
      isUnilateral: true,
      cue: 'Reach forward',
    });
  });

  it('offers editing only for user-owned movements', () => {
    expect(canEditExercise(custom)).toBe(true);
    expect(canEditExercise({ ...custom, isSystem: true })).toBe(false);
  });

  it('counts every referencing session and set before deletion', () => {
    const workout = (id: string, exerciseId: string, sets: number): Workout => ({
      id,
      profileId: 'p1',
      routineDayId: null,
      title: 'Session',
      status: 'completed',
      startedAt: '2026-08-01T10:00:00.000Z',
      endedAt: '2026-08-01T11:00:00.000Z',
      reflection: null,
      sessionRating: null,
      exercises: [
        {
          id: `${id}_block`,
          workoutId: id,
          exerciseId,
          orderIndex: 0,
          notes: null,
          sets: Array.from({ length: sets }, (_, index) => ({
            id: `${id}_set_${index}`,
            workoutExerciseId: `${id}_block`,
            setIndex: index,
            type: 'working',
            weightKg: 10,
            reps: 10,
            rpe: null,
            completed: true,
            restSeconds: null,
            notes: null,
          })),
        },
      ],
    });

    expect(exerciseUsage('custom', [workout('w1', 'custom', 3), workout('w2', 'other', 2), workout('w3', 'custom', 1)])).toEqual({
      workouts: 2,
      sets: 4,
    });
  });

  it('returns custom movements only, sorted by name without mutating the input', () => {
    const input = [custom, { ...custom, id: 'system', name: 'Bench', isSystem: true }, { ...custom, id: 'a', name: 'Arnold press' }];
    expect(customExercises(input).map((exercise) => exercise.id)).toEqual(['a', 'custom']);
    expect(input.map((exercise) => exercise.id)).toEqual(['custom', 'system', 'a']);
  });
});
