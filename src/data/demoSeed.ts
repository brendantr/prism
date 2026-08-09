import { detectWorkoutPrs, type ExerciseBests } from '@/domain/calc/prs';
import { loadIncrementKg, roundToIncrement } from '@/domain/calc/loadRecommendation';
import { getExercise } from './exerciseLibrary';
import { SPECTRUM_FOUR } from './routineTemplates';
import type {
  BodyMeasurement,
  CheckIn,
  PersonalRecord,
  Profile,
  Routine,
  Workout,
  WorkoutExercise,
  WorkoutSet,
} from '@/domain/types';
import { deviceLocalDate } from '@/domain/trainingDay';

/**
 * DEMO SEED
 * =========
 * Generates 8 weeks of training for a fictional intermediate lifter, so PRism
 * has something real to reason about the moment it opens -- no backend, no
 * account, no empty states.
 *
 * The data is produced by a seeded PRNG (mulberry32), so it is identical on
 * every device and every launch. That matters: charts, PRs and recommendations
 * must not shuffle underneath you between reloads.
 *
 * The generated block deliberately includes:
 *   - progressive overload with realistic week-to-week noise
 *   - a planned deload in week 5
 *   - two missed sessions, so consistency is not a flat 100%
 *   - RPE that drifts upward as loads climb
 *   - warm-up sets, which the volume calculation must ignore
 */

export const DEMO_PROFILE_ID = 'demo-profile';
export const DEMO_SEED = 0x9e3779b9;
export const DEMO_WEEKS = 8;

// --- Deterministic PRNG ----------------------------------------------------

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- Per-exercise starting loads (kg) and weekly progression ---------------

interface LoadSpec {
  /** Working weight 8 weeks ago, in kg. 0 = bodyweight-only movement. */
  startKg: number;
  /** Fractional gain per week before noise. */
  weeklyGain: number;
}

const LOAD_SPECS: Record<string, LoadSpec> = {
  ex_back_squat: { startKg: 102.5, weeklyGain: 0.012 },
  ex_deadlift: { startKg: 132.5, weeklyGain: 0.011 },
  ex_bench_press: { startKg: 80, weeklyGain: 0.011 },
  ex_ohp: { startKg: 50, weeklyGain: 0.009 },
  ex_barbell_row: { startKg: 72.5, weeklyGain: 0.011 },
  ex_rdl: { startKg: 90, weeklyGain: 0.012 },
  ex_pullup: { startKg: 7.5, weeklyGain: 0.03 },
  ex_db_incline: { startKg: 30, weeklyGain: 0.01 },
  ex_db_shoulder_press: { startKg: 24, weeklyGain: 0.009 },
  ex_lat_pulldown: { startKg: 65, weeklyGain: 0.012 },
  ex_cable_row: { startKg: 62.5, weeklyGain: 0.012 },
  ex_leg_press: { startKg: 180, weeklyGain: 0.013 },
  ex_leg_curl: { startKg: 45, weeklyGain: 0.011 },
  ex_leg_extension: { startKg: 55, weeklyGain: 0.011 },
  ex_hip_thrust: { startKg: 100, weeklyGain: 0.013 },
  ex_bulgarian_split: { startKg: 22, weeklyGain: 0.012 },
  ex_standing_calf: { startKg: 70, weeklyGain: 0.01 },
  ex_seated_calf: { startKg: 45, weeklyGain: 0.01 },
  ex_lateral_raise: { startKg: 10, weeklyGain: 0.008 },
  ex_face_pull: { startKg: 25, weeklyGain: 0.009 },
  ex_pushdown: { startKg: 32.5, weeklyGain: 0.01 },
  ex_overhead_ext: { startKg: 27.5, weeklyGain: 0.01 },
  ex_incline_curl: { startKg: 14, weeklyGain: 0.009 },
  ex_cable_curl: { startKg: 25, weeklyGain: 0.009 },
  ex_hanging_raise: { startKg: 0, weeklyGain: 0 },
};

/** Week index (0-based) that gets a planned deload. */
const DELOAD_WEEK = 5;
/** Sessions skipped, as "weekIndex:dayIndex". Life happens. */
const SKIPPED_SESSIONS = new Set(['2:3', '6:0']);

// --- Date helpers ----------------------------------------------------------

function startOfDay(d: Date): Date {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

function isoWeekday(d: Date): number {
  return d.getDay() === 0 ? 7 : d.getDay();
}

function startOfIsoWeek(d: Date): Date {
  const c = startOfDay(d);
  c.setDate(c.getDate() - (isoWeekday(c) - 1));
  return c;
}

function addDays(d: Date, days: number): Date {
  const c = new Date(d);
  c.setDate(c.getDate() + days);
  return c;
}

// --- Generation ------------------------------------------------------------

export interface DemoDataset {
  profile: Profile;
  routine: Routine;
  workouts: Workout[];
  checkIns: CheckIn[];
  measurements: BodyMeasurement[];
  personalRecords: PersonalRecord[];
}

export function generateDemoData(now: Date = new Date()): DemoDataset {
  const rand = mulberry32(DEMO_SEED);
  const routine = SPECTRUM_FOUR;

  const profile: Profile = {
    id: DEMO_PROFILE_ID,
    displayName: 'Demo Lifter',
    goal: 'hypertrophy',
    experience: 'intermediate',
    trainingDaysPerWeek: 4,
    preferredWeekdays: [1, 2, 4, 5],
    availableEquipment: ['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight'],
    unit: 'kg',
    bodyweightKg: 82.4,
    createdAt: addDays(now, -DEMO_WEEKS * 7 - 3).toISOString(),
  };

  // Week 0 is the oldest; the final week is the current one.
  const firstWeekStart = startOfIsoWeek(addDays(now, -(DEMO_WEEKS - 1) * 7));
  const workouts: Workout[] = [];

  for (let week = 0; week < DEMO_WEEKS; week++) {
    const weekStart = addDays(firstWeekStart, week * 7);

    for (const day of routine.days) {
      if (SKIPPED_SESSIONS.has(`${week}:${day.dayIndex}`)) continue;
      if (day.weekday == null) continue;

      const date = addDays(weekStart, day.weekday - 1);
      // Only history: never generate a session at or after "now".
      if (date.getTime() >= startOfDay(now).getTime()) continue;

      const startedAt = new Date(date);
      startedAt.setHours(18, 15 + Math.floor(rand() * 25), 0, 0);

      const isDeload = week === DELOAD_WEEK;
      const exercises: WorkoutExercise[] = [];
      const workoutId = `w_${week}_${day.dayIndex}`;

      day.exercises.forEach((slot, slotIndex) => {
        const exercise = getExercise(slot.exerciseId);
        const spec = LOAD_SPECS[slot.exerciseId];
        if (!exercise || !spec) return;

        const increment = loadIncrementKg(exercise.equipment, 'kg');
        const progression = 1 + spec.weeklyGain * week;
        const noise = 1 + (rand() - 0.5) * 0.02;
        const deloadFactor = isDeload ? 0.88 : 1;
        const target = spec.startKg * progression * noise * deloadFactor;
        const workingWeight = spec.startKg === 0 ? 0 : Math.max(increment, roundToIncrement(target, increment));

        const weId = `${workoutId}_e${slotIndex}`;
        const sets: WorkoutSet[] = [];
        let setIndex = 0;

        // Heavy compounds get one logged warm-up. It must never count as volume.
        const isHeavyCompound = slotIndex === 0 && workingWeight >= 60;
        if (isHeavyCompound) {
          sets.push({
            id: `${weId}_s${setIndex}`,
            workoutExerciseId: weId,
            setIndex,
            type: 'warmup',
            weightKg: roundToIncrement(workingWeight * 0.6, increment),
            reps: 5,
            rpe: null,
            completed: true,
            restSeconds: 90,
            notes: null,
          });
          setIndex++;
        }

        const repTarget = slot.targetRepsLow + Math.round(rand() * (slot.targetRepsHigh - slot.targetRepsLow));
        const baseRpe = isDeload ? 6.5 : (slot.targetRpe ?? 8) - 0.5;

        for (let s = 0; s < slot.targetSets; s++) {
          // Reps drift down and RPE drifts up across a working set cluster.
          const fatigueDrop = s === 0 ? 0 : Math.floor(rand() * 1.6);
          const reps = Math.max(1, repTarget - fatigueDrop);
          const rpe = clampHalf(Math.min(10, baseRpe + s * 0.5 + (rand() - 0.5) * 0.6));

          sets.push({
            id: `${weId}_s${setIndex}`,
            workoutExerciseId: weId,
            setIndex,
            type: 'working',
            weightKg: workingWeight,
            reps,
            rpe,
            completed: true,
            restSeconds: slot.restSeconds,
            notes: null,
          });
          setIndex++;
        }

        exercises.push({
          id: weId,
          workoutId,
          exerciseId: slot.exerciseId,
          orderIndex: slotIndex,
          notes: null,
          sets,
        });
      });

      const durationMin = 52 + Math.floor(rand() * 26);
      const rating = isDeload ? 3 : 3 + Math.round(rand() * 2);

      workouts.push({
        id: workoutId,
        profileId: DEMO_PROFILE_ID,
        routineDayId: day.id,
        title: day.name,
        status: 'completed',
        startedAt: startedAt.toISOString(),
        endedAt: new Date(startedAt.getTime() + durationMin * 60_000).toISOString(),
        reflection: sessionReflection(day.dayIndex, isDeload, rand),
        sessionRating: Math.min(5, rating),
        exercises,
      });
    }
  }

  workouts.sort((a, b) => a.startedAt.localeCompare(b.startedAt));

  return {
    profile,
    routine,
    workouts,
    checkIns: generateCheckIns(now, workouts, mulberry32(DEMO_SEED ^ 0x1234)),
    measurements: generateMeasurements(now, mulberry32(DEMO_SEED ^ 0xabcd)),
    personalRecords: derivePersonalRecords(workouts),
  };
}

// --- Sub-generators --------------------------------------------------------

function generateCheckIns(now: Date, workouts: Workout[], rand: () => number): CheckIn[] {
  const trainedDays = new Set(workouts.map((w) => deviceLocalDate(w.startedAt)));
  const checkIns: CheckIn[] = [];

  // One morning check-in per day, including today.
  for (let i = DEMO_WEEKS * 7; i >= 0; i--) {
    const day = addDays(startOfDay(now), -i);
    const key = deviceLocalDate(day);
    const yesterday = deviceLocalDate(addDays(day, -1));
    const trainedYesterday = trainedDays.has(yesterday);

    const at = new Date(day);
    at.setHours(7, 10 + Math.floor(rand() * 40), 0, 0);

    // Soreness is higher the morning after a session; sleep drifts on its own.
    const soreness = clamp1to5(Math.round((trainedYesterday ? 3.2 : 1.9) + (rand() - 0.5) * 1.4));
    const sleep = clamp1to5(Math.round(3.6 + (rand() - 0.5) * 1.8));
    const energy = clamp1to5(Math.round(sleep - (soreness - 3) * 0.4 + (rand() - 0.5) * 1.2));
    const stress = clamp1to5(Math.round(2.6 + (rand() - 0.5) * 1.8));

    checkIns.push({
      id: `ci_${key}`,
      profileId: DEMO_PROFILE_ID,
      localDate: deviceLocalDate(at),
      checkedInAt: at.toISOString(),
      sleepQuality: sleep,
      energy,
      soreness,
      stress,
    });
  }

  return checkIns.sort((a, b) => a.checkedInAt.localeCompare(b.checkedInAt));
}

function generateMeasurements(now: Date, rand: () => number): BodyMeasurement[] {
  const out: BodyMeasurement[] = [];
  // Gentle lean gain: ~+0.15 kg/week with day-to-day water noise.
  for (let week = 0; week < DEMO_WEEKS; week++) {
    const day = addDays(startOfIsoWeek(addDays(now, -(DEMO_WEEKS - 1 - week) * 7)), 0);
    const at = new Date(day);
    at.setHours(7, 30, 0, 0);
    const bodyweight = 81.2 + week * 0.15 + (rand() - 0.5) * 0.7;

    out.push({
      id: `bm_${week}`,
      profileId: DEMO_PROFILE_ID,
      measuredAt: at.toISOString(),
      bodyweightKg: round1(bodyweight),
      bodyFatPct: round1(15.4 - week * 0.06 + (rand() - 0.5) * 0.3),
      circumferencesCm: {
        waist: round1(82.5 - week * 0.08 + (rand() - 0.5) * 0.4),
        chest: round1(103.4 + week * 0.12 + (rand() - 0.5) * 0.4),
        arm: round1(38.2 + week * 0.06 + (rand() - 0.5) * 0.2),
        thigh: round1(60.1 + week * 0.1 + (rand() - 0.5) * 0.3),
      },
    });
  }
  return out;
}

/** Walk history chronologically and record every PR as it happened. */
function derivePersonalRecords(workouts: Workout[]): PersonalRecord[] {
  const bests = new Map<string, ExerciseBests>();
  const records: PersonalRecord[] = [];
  let n = 0;

  for (const workout of workouts) {
    for (const pr of detectWorkoutPrs(workout, bests)) {
      records.push({
        id: `pr_${n++}`,
        profileId: DEMO_PROFILE_ID,
        exerciseId: pr.exerciseId,
        kind: pr.kind,
        value: pr.value,
        reps: pr.reps,
        weightKg: pr.weightKg,
        achievedAt: workout.startedAt,
        workoutId: workout.id,
      });

      const entry = bests.get(pr.exerciseId) ?? { bestE1rm: 0, bestWeightKg: 0 };
      if (pr.kind === 'e1rm') entry.bestE1rm = Math.max(entry.bestE1rm, pr.value);
      if (pr.kind === 'weight') entry.bestWeightKg = Math.max(entry.bestWeightKg, pr.value);
      bests.set(pr.exerciseId, entry);
    }
  }

  return records;
}

const REFLECTIONS: Record<number, string[]> = {
  0: ['Squats moved well off the chest of the hole.', 'Knees felt stiff on the first set, fine after.', 'Best bar speed in weeks.'],
  1: ['Bench lockout is the limiter, not the chest.', 'Rows felt strong. Bench was a grind.', 'Left shoulder a bit cranky on presses.'],
  2: ['Deadlift setup finally feels automatic.', 'Grip gave out before the back did.', 'Hips came up early on the last pull.'],
  3: ['Pull-ups smooth, added weight felt light.', 'Arms were cooked by the end. Good session.', 'Incline press stretch felt great today.'],
};

function sessionReflection(dayIndex: number, isDeload: boolean, rand: () => number): string {
  if (isDeload) return 'Deload week — kept everything crisp and left plenty in the tank.';
  const pool = REFLECTIONS[dayIndex] ?? [];
  if (pool.length === 0 || rand() < 0.35) return '';
  return pool[Math.floor(rand() * pool.length)] ?? '';
}

// --- Small numeric helpers -------------------------------------------------

function clampHalf(n: number): number {
  return Math.round(n * 2) / 2;
}

function clamp1to5(n: number): number {
  return Math.min(5, Math.max(1, n));
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
