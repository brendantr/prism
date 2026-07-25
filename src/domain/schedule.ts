import { addDays, isoWeekday, startOfDay, WEEKDAY_INITIALS, WEEKDAY_NAMES } from '@/utils/format';
import { startOfIsoWeek } from './calc/readiness';
import type { MuscleGroup, Exercise, Profile, Routine, RoutineDay, Workout } from './types';

/**
 * One day of the weekly rhythm strip. Declared here rather than imported from
 * the UI layer: `src/domain` must never depend on `src/components`.
 * `ConsistencyStrip`'s prop type is structurally identical.
 */
export interface WeekDayCell {
  initial: string;
  label: string;
  state: 'done' | 'planned' | 'rest' | 'missed' | 'today';
}

/**
 * Scheduling: which session is on today, and how the week has actually gone.
 *
 * Two resolution strategies, in order:
 *   1. WEEKDAY PIN -- if a routine day is pinned to today's weekday and has not
 *      been trained yet this week, that is today's session. This is what most
 *      lifters mean by "my Tuesday workout".
 *   2. ROTATION    -- otherwise, take the day after the last one trained. This
 *      keeps flexible plans moving without any concept of a missed day.
 */

export interface TodaySession {
  day: RoutineDay;
  /** How we arrived at this recommendation, shown to the user. */
  reason: 'scheduled_today' | 'next_in_rotation' | 'rest_day';
  /** Muscles the session targets, for readiness weighting. */
  targetMuscles: MuscleGroup[];
}

export function resolveTodaySession(
  routine: Routine | null,
  workouts: Workout[],
  exerciseById: Map<string, Exercise>,
  now: Date = new Date(),
): TodaySession | null {
  if (!routine || routine.days.length === 0) return null;

  const today = isoWeekday(now);
  const weekStart = startOfIsoWeek(now).getTime();
  const trainedDayIdsThisWeek = new Set(
    workouts
      .filter((w) => w.status === 'completed' && new Date(w.startedAt).getTime() >= weekStart)
      .map((w) => w.routineDayId)
      .filter((id): id is string => id != null),
  );

  // 1. Pinned to today and not already done.
  const pinned = routine.days.find((d) => d.weekday === today && !trainedDayIdsThisWeek.has(d.id));
  if (pinned) {
    return { day: pinned, reason: 'scheduled_today', targetMuscles: musclesForDay(pinned, exerciseById) };
  }

  // 2. Anything pinned to today at all means today is a training day even if
  //    it is already logged -- but we surface the *next* untrained day instead.
  const nextUntrained = routine.days.find((d) => !trainedDayIdsThisWeek.has(d.id));
  if (nextUntrained) {
    const isScheduledToday = routine.days.some((d) => d.weekday === today);
    return {
      day: nextUntrained,
      reason: isScheduledToday ? 'scheduled_today' : 'next_in_rotation',
      targetMuscles: musclesForDay(nextUntrained, exerciseById),
    };
  }

  // 3. Every day in the plan is done this week.
  const first = routine.days[0];
  return { day: first, reason: 'rest_day', targetMuscles: musclesForDay(first, exerciseById) };
}

export function musclesForDay(day: RoutineDay, exerciseById: Map<string, Exercise>): MuscleGroup[] {
  const set = new Set<MuscleGroup>();
  for (const slot of day.exercises) {
    const exercise = exerciseById.get(slot.exerciseId);
    if (!exercise) continue;
    for (const m of exercise.primaryMuscles) set.add(m);
  }
  return [...set];
}

/** Estimated session length from prescribed sets and rest. */
export function estimateDayMinutes(day: RoutineDay): number {
  const seconds = day.exercises.reduce((total, slot) => {
    // ~40s under load per set, plus the prescribed rest between them.
    const working = slot.targetSets * 40;
    const resting = Math.max(0, slot.targetSets - 1) * slot.restSeconds;
    return total + working + resting;
  }, 0);
  // Plus setup/transition time between exercises.
  return Math.round((seconds + day.exercises.length * 90) / 60);
}

/**
 * Seven cells, Monday to Sunday, describing the current week.
 *
 * A past day the user planned but skipped reads as `missed` -- not hidden, not
 * softened. Consistency is only useful if it is honest.
 */
export function weekCells(
  profile: Profile | null,
  routine: Routine | null,
  workouts: Workout[],
  now: Date = new Date(),
): WeekDayCell[] {
  const weekStart = startOfIsoWeek(now);
  const todayIso = isoWeekday(now);

  const trainedWeekdays = new Set(
    workouts
      .filter((w) => w.status === 'completed' && new Date(w.startedAt).getTime() >= weekStart.getTime())
      .map((w) => isoWeekday(new Date(w.startedAt))),
  );

  const plannedWeekdays = new Set<number>(
    routine
      ? routine.days.map((d) => d.weekday).filter((w): w is number => w != null)
      : (profile?.preferredWeekdays ?? []),
  );

  return Array.from({ length: 7 }, (_, i) => {
    const weekday = i + 1;
    const date = addDays(weekStart, i);
    const isPast = startOfDay(date).getTime() < startOfDay(now).getTime();
    const isToday = weekday === todayIso;

    let state: WeekDayCell['state'];
    if (trainedWeekdays.has(weekday)) state = 'done';
    else if (isToday) state = plannedWeekdays.has(weekday) ? 'today' : 'rest';
    else if (isPast && plannedWeekdays.has(weekday)) state = 'missed';
    else if (plannedWeekdays.has(weekday)) state = 'planned';
    else state = 'rest';

    return { initial: WEEKDAY_INITIALS[i], label: WEEKDAY_NAMES[i], state };
  });
}

/** The most recent completed session for a given routine day, if any. */
export function lastSessionForDay(workouts: Workout[], routineDayId: string): Workout | null {
  const matches = workouts
    .filter((w) => w.status === 'completed' && w.routineDayId === routineDayId)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  return matches[0] ?? null;
}

/** Most recent completed sets for one exercise, for the "last time" column. */
export function previousSetsForExercise(
  workouts: Workout[],
  exerciseId: string,
  excludeWorkoutId?: string,
): { workout: Workout; sets: Workout['exercises'][number]['sets'] } | null {
  const ordered = [...workouts]
    .filter((w) => w.status === 'completed' && w.id !== excludeWorkoutId)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));

  for (const workout of ordered) {
    const match = workout.exercises.find((we) => we.exerciseId === exerciseId);
    if (match && match.sets.some((s) => s.completed)) {
      return { workout, sets: match.sets.filter((s) => s.completed) };
    }
  }
  return null;
}
