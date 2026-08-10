/**
 * PRism domain types.
 *
 * These mirror the Postgres schema in `supabase/migrations/0001_init.sql`
 * one-to-one (snake_case columns -> camelCase fields, mapped in the repository
 * layer). Nothing in the UI should invent its own shape for these entities.
 */

// ---------------------------------------------------------------------------
// Enums / unions
// ---------------------------------------------------------------------------

export const MUSCLE_GROUPS = [
  'chest',
  'front_delts',
  'side_delts',
  'rear_delts',
  'lats',
  'upper_back',
  'traps',
  'lower_back',
  'biceps',
  'triceps',
  'forearms',
  'core',
  'glutes',
  'quads',
  'hamstrings',
  'calves',
] as const;
export type MuscleGroup = (typeof MUSCLE_GROUPS)[number];

export const EQUIPMENT = [
  'barbell',
  'dumbbell',
  'machine',
  'cable',
  'bodyweight',
  'kettlebell',
  'band',
  'smith',
] as const;
export type Equipment = (typeof EQUIPMENT)[number];

export type Unit = 'kg' | 'lb';
export type Goal = 'strength' | 'hypertrophy' | 'general_fitness' | 'fat_loss';
export type Experience = 'beginner' | 'intermediate' | 'advanced';
export type SetType = 'working' | 'warmup' | 'dropset' | 'failure' | 'backoff';
export type PrKind = 'e1rm' | 'weight' | 'volume' | 'reps';
export type WorkoutStatus = 'in_progress' | 'completed' | 'abandoned';

// ---------------------------------------------------------------------------
// Entities
// ---------------------------------------------------------------------------

export interface Profile {
  id: string;
  displayName: string;
  goal: Goal;
  experience: Experience;
  /** Target sessions per week, 3-6 for the core audience. */
  trainingDaysPerWeek: number;
  /** ISO weekday numbers the user intends to train (1 = Monday). */
  preferredWeekdays: number[];
  availableEquipment: Equipment[];
  unit: Unit;
  bodyweightKg: number | null;
  createdAt: string;
}

export interface Exercise {
  id: string;
  name: string;
  equipment: Equipment;
  primaryMuscles: MuscleGroup[];
  secondaryMuscles: MuscleGroup[];
  /** Whether the movement is loaded bilaterally by a bar/machine. Affects rounding. */
  isUnilateral: boolean;
  /** true for exercises seeded by PRism, false for user-created ones. */
  isSystem: boolean;
  /** Free-text cue shown in the picker. Original PRism copy. */
  cue?: string;
}

export interface WorkoutSet {
  id: string;
  workoutExerciseId: string;
  setIndex: number;
  type: SetType;
  weightKg: number;
  reps: number;
  /** Rate of perceived exertion, 5-10 in half steps. Null = not recorded. */
  rpe: number | null;
  completed: boolean;
  restSeconds: number | null;
  notes: string | null;
}

export interface WorkoutExercise {
  id: string;
  workoutId: string;
  exerciseId: string;
  orderIndex: number;
  notes: string | null;
  sets: WorkoutSet[];
}

export interface Workout {
  id: string;
  profileId: string;
  routineDayId: string | null;
  title: string;
  status: WorkoutStatus;
  startedAt: string;
  endedAt: string | null;
  /** User's own words about the session. Surfaced in the summary screen. */
  reflection: string | null;
  /** 1-5 subjective session quality. */
  sessionRating: number | null;
  exercises: WorkoutExercise[];
}

export interface RoutineExercise {
  id: string;
  routineDayId: string;
  exerciseId: string;
  orderIndex: number;
  targetSets: number;
  targetRepsLow: number;
  targetRepsHigh: number;
  targetRpe: number | null;
  restSeconds: number;
}

export interface RoutineDay {
  id: string;
  routineId: string;
  name: string;
  /** Position in the rotation, 0-indexed. */
  dayIndex: number;
  /** Optional ISO weekday pin (1 = Monday). Null = flexible rotation. */
  weekday: number | null;
  exercises: RoutineExercise[];
}

export interface Routine {
  id: string;
  profileId: string | null;
  name: string;
  description: string;
  daysPerWeek: number;
  isTemplate: boolean;
  /**
   * The lifter's chosen plan (`routines.is_active`).
   *
   * Only meaningful on a routine the lifter owns. A PRism template has
   * `profileId === null` and is one shared row read by every account, so a flag
   * on it would mean "active for everyone" -- which is why
   * `selectActiveRoutine` resolves a template choice from the profile instead.
   * See `src/domain/settings.ts`.
   */
  isActive: boolean;
  days: RoutineDay[];
}

export interface BodyMeasurement {
  id: string;
  profileId: string;
  measuredAt: string;
  bodyweightKg: number | null;
  bodyFatPct: number | null;
  /** cm, keyed by site e.g. { waist: 82, chest: 104 } */
  circumferencesCm: Record<string, number>;
}

export interface CheckIn {
  id: string;
  profileId: string;
  /** Device-local `YYYY-MM-DD` captured when the check-in is submitted. */
  localDate: string;
  /** Latest submission instant; ordering and readiness staleness use this. */
  checkedInAt: string;
  /**
   * 1-5 scales, self-reported each morning. Feed the readiness estimate.
   *
   * Every field is answered independently: `null` means the user has not
   * provided it. A null is never defaulted to a neutral or zero value -- not
   * when stored, and not by any factor that reads it.
   */
  sleepQuality: number | null;
  energy: number | null;
  soreness: number | null;
  stress: number | null;
}

/** Fields a check-in submission is allowed to leave out entirely. */
type CheckInOptional = 'sleepQuality' | 'energy' | 'soreness' | 'stress';

/**
 * A check-in submission, which may cover only part of the record.
 *
 * Three states have to stay distinguishable all the way down to storage:
 *
 *   property omitted           leave whatever is already stored alone
 *   property present, 1-5      overwrite with that answer
 *   property present, null     clear the stored answer
 *
 * The third is why this type exists. Collapsing null into "absent" would make
 * an erased answer come back on the next read.
 */
export type CheckInPatch = Omit<CheckIn, CheckInOptional> &
  Partial<Pick<CheckIn, CheckInOptional>>;

export interface PersonalRecord {
  id: string;
  profileId: string;
  exerciseId: string;
  kind: PrKind;
  value: number;
  /** Reps achieved at `value` weight, for context on e1rm/weight PRs. */
  reps: number | null;
  weightKg: number | null;
  achievedAt: string;
  workoutId: string;
}

// ---------------------------------------------------------------------------
// Derived / view models (never persisted)
// ---------------------------------------------------------------------------

export interface MuscleVolume {
  muscle: MuscleGroup;
  /** Effective volume in kg, secondary muscles discounted. */
  volumeKg: number;
  /** Effective hard sets, secondary muscles counted fractionally. */
  sets: number;
}

export interface MuscleRecovery {
  muscle: MuscleGroup;
  /** 0-1, where 1 = fully recovered by this model's estimate. */
  readiness: number;
  hoursSinceLastStimulus: number | null;
  /** How long this model thinks the muscle needs, given the load it absorbed. */
  estimatedRecoveryHours: number;
  status: 'fresh' | 'ready' | 'moderate' | 'fatigued' | 'depleted';
}

export type ReadinessBand = 'low' | 'moderate' | 'good' | 'peak';

export interface ReadinessFactor {
  key: 'recovery' | 'workload' | 'wellbeing' | 'consistency';
  label: string;
  /** 0-1 contribution before weighting. Not meaningful when `sufficient` is false. */
  score: number;
  /**
   * The weight actually applied on this evaluation: 0 when `sufficient` is
   * false, otherwise the base weight re-normalised across the factors that do
   * have data. `READINESS_WEIGHTS` itself never changes.
   */
  weight: number;
  /** Plain-language explanation shown in the "why" sheet. */
  detail: string;
  /** false = no usable input; the factor was excluded from the composite. */
  sufficient: boolean;
  /** Inputs the user has not provided, when some or all are missing. */
  missing?: string[];
}

export interface ReadinessResult {
  /**
   * 0-100. Explicitly an estimate; the UI must label it as one.
   *
   * Null when there is too little input to publish a number honestly. A null
   * score is not a zero score, and must never be rendered as one.
   */
  score: number | null;
  band: ReadinessBand | null;
  factors: ReadinessFactor[];
  /**
   * `full`         every factor had usable input.
   * `partial`      at least one factor was excluded; weights re-normalised.
   * `insufficient` too little input to publish a score at all.
   */
  confidence: 'full' | 'partial' | 'insufficient';
}

export interface LoadSuggestion {
  exerciseId: string;
  suggestedWeightKg: number;
  previousWeightKg: number | null;
  deltaKg: number;
  targetReps: number;
  action: 'increase' | 'hold' | 'deload' | 'establish';
  confidence: 'low' | 'medium' | 'high';
  /** Every rule that fired, in plain language. Shown verbatim to the user. */
  rationale: string[];
}

export interface SetPrResult {
  isE1rmPr: boolean;
  isWeightPr: boolean;
  e1rm: number;
  previousBestE1rm: number | null;
  previousBestWeightKg: number | null;
}

export interface WorkoutSummaryStats {
  totalVolumeKg: number;
  workingSets: number;
  totalReps: number;
  durationMinutes: number | null;
  muscleDistribution: MuscleVolume[];
  prs: Array<{ exerciseId: string; exerciseName: string; kind: PrKind; value: number }>;
}
