import { averageReadiness } from './recovery';
import { workoutVolume } from './volume';
import type {
  CheckIn,
  MuscleGroup,
  MuscleRecovery,
  Profile,
  ReadinessBand,
  ReadinessFactor,
  ReadinessResult,
  Workout,
} from '../types';

/**
 * READINESS SCORE
 * ===============
 * A 0-100 composite that answers one question: "how hard should I go today?"
 *
 * It is built from four factors, each scored 0-1 and then weighted. Every
 * factor carries its own plain-language `detail` string, and the Today screen
 * shows all four -- the number is never presented without its reasoning.
 *
 *   RECOVERY    40%  Estimated readiness of the muscles today's session targets.
 *   WORKLOAD    25%  Acute:chronic ratio -- last 7 days vs. the 28-day weekly average.
 *   WELLBEING   25%  Latest morning check-in (sleep, energy, soreness, stress).
 *   CONSISTENCY 10%  Sessions completed this week against the user's own target.
 *
 * Like the recovery estimate, this is a heuristic. It is labelled as one.
 *
 * A factor with no usable input is EXCLUDED, not scored. It never contributes a
 * neutral stand-in value: the remaining weights are re-normalised around it. If
 * both the training-load and check-in signals are missing, no score is produced
 * at all -- see `computeReadiness`.
 */

export const READINESS_WEIGHTS = {
  recovery: 0.4,
  workload: 0.25,
  wellbeing: 0.25,
  consistency: 0.1,
} as const;

export const READINESS_EXPLANATION =
  'Readiness blends your estimated muscle recovery, recent training load, your latest check-in, and how ' +
  'consistently you have trained this week. It is a planning estimate, not a health metric.';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export interface ReadinessInput {
  profile: Profile;
  workouts: Workout[];
  recovery: MuscleRecovery[];
  /** Muscles the scheduled session will target. Empty = whole-body average. */
  targetMuscles: MuscleGroup[];
  latestCheckIn: CheckIn | null;
  now?: Date;
}

export function computeReadiness(input: ReadinessInput): ReadinessResult {
  const now = input.now ?? new Date();
  const evaluated: ReadinessFactor[] = [
    recoveryFactor(input),
    workloadFactor(input.workouts, now),
    wellbeingFactor(input.latestCheckIn, now),
    consistencyFactor(input.profile, input.workouts, now),
  ];

  const missingKey = (key: ReadinessFactor['key']) =>
    evaluated.some((f) => f.key === key && !f.sufficient);

  const sufficientWeight = evaluated
    .filter((f) => f.sufficient)
    .reduce((sum, f) => sum + f.weight, 0);

  /*
   * The one case we refuse to put a number on. Recovery and consistency alone
   * describe what the body has absorbed and what the calendar says -- neither
   * knows how the lifter has actually trained lately or how they feel today.
   * Publishing a score off those two would be the neutral-default problem in a
   * new costume, so we say we do not know instead.
   */
  const insufficient = (missingKey('workload') && missingKey('wellbeing')) || sufficientWeight <= 0;

  const factors: ReadinessFactor[] = evaluated.map((f) => ({
    ...f,
    weight: insufficient || !f.sufficient ? 0 : f.weight / sufficientWeight,
  }));

  if (insufficient) {
    return { score: null, band: null, factors, confidence: 'insufficient' };
  }

  const weighted = factors.reduce((sum, f) => sum + f.score * f.weight, 0);
  const score = Math.round(clamp(weighted, 0, 1) * 100);

  return {
    score,
    band: bandFor(score),
    factors,
    confidence: factors.every((f) => f.sufficient) ? 'full' : 'partial',
  };
}

export function bandFor(score: number): ReadinessBand {
  if (score >= 85) return 'peak';
  if (score >= 68) return 'good';
  if (score >= 48) return 'moderate';
  return 'low';
}

export const BAND_COPY: Record<ReadinessBand, { title: string; guidance: string }> = {
  peak: { title: 'Peak', guidance: 'Green light for top sets. Chase the load.' },
  good: { title: 'Good', guidance: 'Train as planned. Push the last set if it moves well.' },
  moderate: { title: 'Moderate', guidance: 'Hit your work, cap RPE around 8, skip the grinders.' },
  low: { title: 'Low', guidance: 'Trim a set or two and keep the bar speed honest.' },
};

/** Copy for the states where readiness is partial or cannot be scored at all. */
export const INSUFFICIENT_COPY = {
  title: 'Not enough recent input',
  body: "Add a check-in and keep logging sessions to make today's guidance more useful.",
  /** Shown alongside a score that was computed from fewer than all four factors. */
  partial: 'Based on available inputs',
  /** Marks a single factor that was excluded from the composite. */
  factorExcluded: 'Not counted',
} as const;

// --- Individual factors ----------------------------------------------------

function recoveryFactor({ recovery, targetMuscles }: ReadinessInput): ReadinessFactor {
  const muscles = targetMuscles.length > 0 ? targetMuscles : recovery.map((r) => r.muscle);
  const score = averageReadiness(recovery, muscles);
  const laggards = recovery
    .filter((r) => muscles.includes(r.muscle) && r.readiness < 0.6)
    .sort((a, b) => a.readiness - b.readiness)
    .slice(0, 2);

  const detail =
    laggards.length > 0
      ? `${laggards.map((l) => humanMuscle(l.muscle)).join(' and ')} still ${laggards.length > 1 ? 'have' : 'has'} fatigue on the estimate.`
      : targetMuscles.length > 0
        ? 'Everything today’s session targets is estimated recovered.'
        : 'Whole-body recovery estimate looks clear.';

  return {
    key: 'recovery',
    label: 'Muscle recovery',
    score: clamp(score, 0, 1),
    weight: READINESS_WEIGHTS.recovery,
    detail,
    sufficient: true,
  };
}

/**
 * Acute:chronic workload ratio. Sweet spot is 0.8-1.3: enough stimulus to
 * progress, not so much that you have spiked. Both under- and over-shooting
 * pull the score down, which is the point.
 */
function workloadFactor(workouts: Workout[], now: Date): ReadinessFactor {
  const acute = volumeInWindow(workouts, now, 7);
  const chronicTotal = volumeInWindow(workouts, now, 28);
  const chronicWeekly = chronicTotal / 4;

  if (chronicWeekly < 1) {
    // No usable trend. Excluded rather than scored -- see `computeReadiness`.
    return {
      key: 'workload',
      label: 'Training load',
      score: 0,
      weight: READINESS_WEIGHTS.workload,
      detail: 'Not enough history yet to judge your load trend.',
      sufficient: false,
    };
  }

  const ratio = acute / chronicWeekly;
  let score: number;
  let detail: string;

  if (ratio < 0.6) {
    score = 0.72;
    detail = `This week is ${pct(ratio)} of your usual volume — you have room to work.`;
  } else if (ratio <= 1.3) {
    score = 1;
    detail = `Volume is tracking at ${pct(ratio)} of your 4-week average. Well placed.`;
  } else if (ratio <= 1.6) {
    score = 0.6;
    detail = `You are ${pct(ratio)} of your usual volume. Watch for accumulating fatigue.`;
  } else {
    score = 0.32;
    detail = `A sharp spike — ${pct(ratio)} of your 4-week average. Consider backing off.`;
  }

  return {
    key: 'workload',
    label: 'Training load',
    score,
    weight: READINESS_WEIGHTS.workload,
    detail,
    sufficient: true,
  };
}

/**
 * The four check-in fields, each with the share of the wellbeing score it
 * carries. Sleep and energy are "higher is better"; soreness and stress are
 * inverted.
 *
 * These shares are the original `positives * 0.65 + (1 - negatives) * 0.35`
 * formula written out per field: with all four answered they reproduce it
 * exactly. Written this way, an unanswered field can simply drop out and the
 * rest re-normalise, instead of being filled in with a value the lifter never
 * gave us.
 */
const WELLBEING_FIELDS = [
  { field: 'sleepQuality', name: 'sleep', label: 'Sleep quality', share: 0.325, inverted: false },
  { field: 'energy', name: 'energy', label: 'Energy', share: 0.325, inverted: false },
  { field: 'soreness', name: 'soreness', label: 'Soreness', share: 0.175, inverted: true },
  { field: 'stress', name: 'stress', label: 'Stress', share: 0.175, inverted: true },
] as const;

/**
 * Latest check-in, but only if it is recent. A three-day-old "slept great"
 * tells us nothing about this morning, so a stale check-in is not counted --
 * which the copy has always said, and now the arithmetic agrees.
 */
function wellbeingFactor(checkIn: CheckIn | null, now: Date): ReadinessFactor {
  const base = {
    key: 'wellbeing',
    label: 'Check-in',
    weight: READINESS_WEIGHTS.wellbeing,
  } as const;
  const allFields = WELLBEING_FIELDS.map((f) => f.label);

  if (!checkIn) {
    return {
      ...base,
      score: 0,
      detail: 'No check-in logged. Add one for a sharper score.',
      sufficient: false,
      missing: allFields,
    };
  }

  const hoursOld = (now.getTime() - new Date(checkIn.checkedInAt).getTime()) / HOUR;
  if (hoursOld > 36) {
    return {
      ...base,
      score: 0,
      detail: `Your last check-in is ${Math.round(hoursOld / 24)} days old — not counting it.`,
      sufficient: false,
      missing: allFields,
    };
  }

  const answered = WELLBEING_FIELDS.filter((f) => checkIn[f.field] != null).map((f) => ({
    name: f.name,
    share: f.share,
    // Non-null by the filter above.
    v: f.inverted ? 1 - norm(checkIn[f.field] as number) : norm(checkIn[f.field] as number),
  }));
  const missing = WELLBEING_FIELDS.filter((f) => checkIn[f.field] == null).map((f) => f.label);

  if (answered.length === 0) {
    return {
      ...base,
      score: 0,
      detail: 'No check-in logged. Add one for a sharper score.',
      sufficient: false,
      missing,
    };
  }

  const totalShare = answered.reduce((sum, f) => sum + f.share, 0);
  const score = clamp(answered.reduce((sum, f) => sum + f.v * f.share, 0) / totalShare, 0, 1);

  const weakest = [...answered].sort((a, b) => a.v - b.v)[0];

  const detail =
    score >= 0.75
      ? 'This morning’s check-in came back strong.'
      : `Check-in flags ${weakest.name} as the limiter today.`;

  return missing.length > 0
    ? { ...base, score, detail, sufficient: true, missing }
    : { ...base, score, detail, sufficient: true };
}

function consistencyFactor(profile: Profile, workouts: Workout[], now: Date): ReadinessFactor {
  const done = completedThisWeek(workouts, now);
  const target = Math.max(1, profile.trainingDaysPerWeek);
  const score = clamp(done / target, 0, 1);
  const remaining = Math.max(0, target - done);

  const detail =
    remaining === 0
      ? `All ${target} planned sessions are in. Anything now is a bonus.`
      : `${done} of ${target} sessions done — ${remaining} to go this week.`;

  return {
    key: 'consistency',
    label: 'Consistency',
    score,
    weight: READINESS_WEIGHTS.consistency,
    detail,
    sufficient: true,
  };
}

// --- Helpers ---------------------------------------------------------------

export function volumeInWindow(workouts: Workout[], now: Date, days: number): number {
  const cutoff = now.getTime() - days * DAY;
  return workouts
    .filter((w) => w.status === 'completed' && new Date(w.startedAt).getTime() >= cutoff)
    .reduce((sum, w) => sum + workoutVolume(w), 0);
}

/**
 * Sessions completed inside the ISO week containing `reference`.
 *
 * The window is bounded at BOTH ends. That upper bound is load-bearing: this
 * function is also called with past reference dates to walk a training streak
 * backwards, and an open-ended window would let every historic week absorb all
 * the training that came after it — making any past week trivially clear the
 * target and reporting an unbroken streak stretching back before the user
 * had even started.
 */
export function completedThisWeek(workouts: Workout[], reference: Date): number {
  const start = startOfIsoWeek(reference).getTime();
  const end = start + 7 * DAY;
  return workouts.filter((w) => {
    if (w.status !== 'completed') return false;
    const at = new Date(w.startedAt).getTime();
    return at >= start && at < end;
  }).length;
}

export function startOfIsoWeek(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const isoDay = d.getDay() === 0 ? 7 : d.getDay(); // Sunday -> 7
  d.setDate(d.getDate() - (isoDay - 1));
  return d;
}

function norm(value1to5: number): number {
  return clamp((value1to5 - 1) / 4, 0, 1);
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function pct(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}

function humanMuscle(m: MuscleGroup): string {
  return m.replace(/_/g, ' ');
}
