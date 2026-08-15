import { e1rmSeries } from './prs';
import type { Exercise, Workout } from '../types';

/**
 * KEY LIFTS
 * =========
 * Which movements the Progress screen plots an estimated-1RM trend for.
 *
 * **Why this is a function and not a list.** Progress used to hard-code four
 * exercise ids -- `ex_back_squat`, `ex_bench_press`, `ex_deadlift`, `ex_pullup`
 * -- which are slugs from `src/data/exerciseLibrary.ts`, the bundled catalogue
 * demo mode reads from. Against Supabase the same movements are seeded by
 * `0006_seed_library.sql` with `gen_random_uuid()`, so their ids are UUIDs and
 * pinned to nothing. `e1rmSeries` matches on exact id, so every series came back
 * empty and the panel was blank for every real account no matter how much the
 * lifter trained. A fixed id list cannot survive two id spaces; the lifter's own
 * history is the same in both.
 *
 * **What gets picked.** The movements trained most often inside the window,
 * heaviest first among equals. "Most trained" is the honest reading of "key":
 * it is what the lifter actually keeps coming back to, rather than what PRism
 * assumed they would.
 *
 * **What is deliberately NOT modelled** `[decision]`: compound versus isolation.
 * Nothing in `Exercise` records it, and deriving it from muscle counts would be
 * PRism inventing a classification and then quietly filtering a lifter's lift
 * out of their own progress panel on the strength of it. If that judgement is
 * ever wanted it should be real metadata with a real decision behind it.
 */

/**
 * How far back a key lift is chosen and plotted from.
 *
 * Also the number the section heading quotes. The two used to disagree: the
 * heading said "8 weeks" while `e1rmSeries` was handed the entire history, so
 * the span was accurate only because demo mode happens to seed exactly eight
 * weeks (`DEMO_WEEKS`). A real account with a year behind it would have been
 * shown a year under a label that said eight weeks.
 */
export const KEY_LIFT_WINDOW_DAYS = 56;

/** Weeks in the window, for copy that has to name the span. */
export const KEY_LIFT_WINDOW_WEEKS = KEY_LIFT_WINDOW_DAYS / 7;

/**
 * Sessions of the same movement needed before a trend is drawn.
 *
 * Two is the floor rather than a preference: one point is a reading, not a
 * trend, and a percentage change needs something to change from.
 */
export const KEY_LIFT_MIN_SESSIONS = 2;

/** How many lifts the panel shows. Matches the four rows it was built for. */
export const KEY_LIFT_LIMIT = 4;

export interface KeyLiftPoint {
  date: string;
  e1rm: number;
  weightKg: number;
  reps: number;
}

export interface KeyLift {
  exerciseId: string;
  /** Resolved from the store's exercise map -- never a raw id. See below. */
  name: string;
  /** Best estimated 1RM of the most recent session in the window, kg. */
  current: number;
  /** Fractional change across the window, first session to last. */
  change: number;
  /** One point per session, oldest first. */
  points: KeyLiftPoint[];
}

export interface SelectKeyLiftsOptions {
  windowDays?: number;
  minSessions?: number;
  limit?: number;
}

/**
 * The lifter's key lifts, derived from what they actually logged.
 *
 * Pure: callers pass `now` so the window is testable and so two screens
 * rendering in the same frame cannot disagree about where it starts.
 */
export function selectKeyLifts(
  workouts: Workout[],
  exerciseById: Map<string, Exercise>,
  now: Date = new Date(),
  options: SelectKeyLiftsOptions = {},
): KeyLift[] {
  const {
    windowDays = KEY_LIFT_WINDOW_DAYS,
    minSessions = KEY_LIFT_MIN_SESSIONS,
    limit = KEY_LIFT_LIMIT,
  } = options;

  const nowMs = now.getTime();
  const cutoff = nowMs - windowDays * 86_400_000;
  const inWindow = workouts.filter((w) => {
    const started = new Date(w.startedAt).getTime();
    return (
      w.status === 'completed' &&
      Number.isFinite(started) &&
      started >= cutoff &&
      started <= nowMs
    );
  });

  const candidates = new Set<string>();
  for (const workout of inWindow) {
    for (const we of workout.exercises) candidates.add(we.exerciseId);
  }

  const lifts: KeyLift[] = [];

  for (const exerciseId of candidates) {
    /*
      An id with no exercise behind it is skipped rather than rendered.

      The fallback this replaces was `exerciseById.get(id)?.name ?? id`, which
      against Supabase would have printed a bare UUID as the name of a lift.
      A row that cannot say which movement it describes is worse than no row,
      and the panel below it now explains its own emptiness.
    */
    const exercise = exerciseById.get(exerciseId);
    if (!exercise) continue;

    const points = e1rmSeries(inWindow, exerciseId);
    if (points.length < minSessions) continue;

    const first = points[0];
    const last = points[points.length - 1];
    // `e1rmSeries` only emits points with a positive e1RM, so this cannot
    // divide by zero -- asserted rather than assumed in the tests.
    lifts.push({
      exerciseId,
      name: exercise.name,
      current: last.e1rm,
      change: (last.e1rm - first.e1rm) / first.e1rm,
      points,
    });
  }

  /*
    Most sessions first, then the heavier lift, then alphabetically.

    The last tie-break exists so the panel does not reshuffle between renders
    on the iteration order of a Set: two lifts trained the same number of times
    to the same estimated max are otherwise indistinguishable, and a list that
    reorders itself for no visible reason reads as a bug.
  */
  return lifts
    .sort(
      (a, b) =>
        b.points.length - a.points.length ||
        b.current - a.current ||
        a.name.localeCompare(b.name),
    )
    .slice(0, limit);
}
