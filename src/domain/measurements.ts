import { displayToKg, kgToDisplay } from './calc/loadRecommendation';
import type { BodyMeasurement, Unit } from './types';

/**
 * BODY MEASUREMENTS
 * =================
 * Parsing, validating and reading back the one table PRism has always stored
 * and never let anyone write.
 *
 * `listMeasurements()` has existed since the first repository, `trainingStore`
 * has populated `measurements` since the first load, and until this sprint
 * nothing wrote a measurement and nothing read the store field either. The
 * demo seed generated a year of them so the shape was never in doubt; a real
 * account's array was always empty.
 *
 * Pure by design, for the usual reason: no component-test tooling exists in
 * this repository, so the rules live where a test can reach them.
 *
 * WHAT POSTGRES ALREADY CHECKS
 * ----------------------------
 * `body_measurements` (`supabase/migrations/0001_init.sql:180-192`):
 *
 *   bodyweight_kg     numeric(6,2)  check (bodyweight_kg > 0)
 *   body_fat_pct      numeric(4,1)  check (body_fat_pct between 1 and 70)
 *   circumferences_cm jsonb         not null default '{}'
 *
 * Each database constraint is re-checked here so an out-of-range entry is a
 * sentence under the field instead of a rejected request. The client also
 * applies explicit upper bounds to bodyweight and waist circumference; those
 * product input limits prevent unusable values in columns whose schema either
 * has a much wider numeric ceiling or stores an unconstrained JSON number.
 *
 * NOT A HEALTH ASSESSMENT (`Docs/invariants.md` I-8). These are numbers the
 * lifter typed. Nothing here interprets them, scores them, or says anything
 * about what they mean.
 */

/** Storage is always kilograms; `unit` is a display preference (0001 header). */
export const BODYWEIGHT_MAX_KG = 500;
export const BODY_FAT_MIN_PCT = 1;
export const BODY_FAT_MAX_PCT = 70;
export const WAIST_MAX_CM = 300;

/** The circumference site this sprint exposes for entry. */
export const WAIST_SITE = 'waist';

/** Exactly what the form holds: three strings in the lifter's own units. */
export interface MeasurementDraft {
  /** In the profile's display unit, not necessarily kilograms. */
  bodyweight: string;
  bodyFatPct: string;
  waistCm: string;
}

export type MeasurementProblem =
  | 'nothing_entered'
  | 'bodyweight_invalid'
  | 'body_fat_invalid'
  | 'waist_invalid';

export type MeasurementValidation =
  | { ok: true; value: BodyMeasurement }
  | { ok: false; problem: MeasurementProblem };

export function emptyMeasurementDraft(): MeasurementDraft {
  return { bodyweight: '', bodyFatPct: '', waistCm: '' };
}

/**
 * Load a stored measurement back into a form, in the lifter's display unit.
 *
 * Circumference sites other than the waist are deliberately absent from the
 * draft and preserved by `validateMeasurement` instead -- see its `existing`
 * option. A form that cannot show a value must not be the reason it is lost.
 */
export function draftFromMeasurement(
  measurement: BodyMeasurement,
  unit: Unit,
): MeasurementDraft {
  const waist = measurement.circumferencesCm[WAIST_SITE];
  return {
    bodyweight:
      measurement.bodyweightKg == null
        ? ''
        : trimNumber(kgToDisplay(measurement.bodyweightKg, unit)),
    bodyFatPct: measurement.bodyFatPct == null ? '' : trimNumber(measurement.bodyFatPct),
    waistCm: waist == null ? '' : trimNumber(waist),
  };
}

export interface MeasurementIdentity {
  id: string;
  profileId: string;
  measuredAt: string;
  unit: Unit;
  /** The record being edited, when there is one. Its unknown sites survive. */
  existing?: BodyMeasurement;
}

/**
 * Parse a draft into a storable record, or say which field is wrong.
 *
 * Every field is independently optional and an empty field means "not
 * measured", stored as null -- the same rule the check-in scales follow
 * (`Docs/invariants.md` I-7). What is refused is a submission where *nothing*
 * was entered, which would write a row that records only the fact that someone
 * opened a form.
 */
export function validateMeasurement(
  draft: MeasurementDraft,
  identity: MeasurementIdentity,
): MeasurementValidation {
  const bodyweight = parseOptionalNumber(draft.bodyweight);
  if (bodyweight === 'invalid') return { ok: false, problem: 'bodyweight_invalid' };

  const bodyFatPct = parseOptionalNumber(draft.bodyFatPct);
  if (bodyFatPct === 'invalid') return { ok: false, problem: 'body_fat_invalid' };

  const waistCm = parseOptionalNumber(draft.waistCm);
  if (waistCm === 'invalid') return { ok: false, problem: 'waist_invalid' };

  if (bodyweight == null && bodyFatPct == null && waistCm == null) {
    return { ok: false, problem: 'nothing_entered' };
  }

  let bodyweightKg: number | null = null;
  if (bodyweight != null) {
    bodyweightKg = round2(displayToKg(bodyweight, identity.unit));
    if (bodyweightKg <= 0 || bodyweightKg > BODYWEIGHT_MAX_KG) {
      return { ok: false, problem: 'bodyweight_invalid' };
    }
  }

  if (bodyFatPct != null && (bodyFatPct < BODY_FAT_MIN_PCT || bodyFatPct > BODY_FAT_MAX_PCT)) {
    return { ok: false, problem: 'body_fat_invalid' };
  }

  if (waistCm != null && (waistCm <= 0 || waistCm > WAIST_MAX_CM)) {
    return { ok: false, problem: 'waist_invalid' };
  }

  // Sites this form does not show are carried over rather than dropped. The
  // demo seed stores chest, arm and thigh, and an export is supposed to be
  // everything the account holds -- losing three of them to an edit of the
  // fourth would be a silent deletion.
  const circumferencesCm: Record<string, number> = { ...(identity.existing?.circumferencesCm ?? {}) };
  if (waistCm == null) delete circumferencesCm[WAIST_SITE];
  else circumferencesCm[WAIST_SITE] = round1(waistCm);

  return {
    ok: true,
    value: {
      id: identity.id,
      profileId: identity.profileId,
      measuredAt: identity.measuredAt,
      bodyweightKg,
      bodyFatPct: bodyFatPct == null ? null : round1(bodyFatPct),
      circumferencesCm,
    },
  };
}

/** Newest first -- what the Body screen lists. */
export function measurementsNewestFirst(measurements: BodyMeasurement[]): BodyMeasurement[] {
  return [...measurements].sort((a, b) => b.measuredAt.localeCompare(a.measuredAt));
}

export function latestMeasurement(measurements: BodyMeasurement[]): BodyMeasurement | null {
  return measurementsNewestFirst(measurements)[0] ?? null;
}

/**
 * Change in bodyweight between the two most recent entries that recorded one.
 *
 * Entries with no bodyweight are skipped rather than treated as zero, so a
 * waist-only entry does not read as a 82 kg loss.
 */
export function bodyweightChangeKg(measurements: BodyMeasurement[]): number | null {
  const weighed = measurementsNewestFirst(measurements).filter((m) => m.bodyweightKg != null);
  if (weighed.length < 2) return null;
  return round2((weighed[0].bodyweightKg as number) - (weighed[1].bodyweightKg as number));
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

/**
 * `null` for an empty field, `'invalid'` for something that is not a number.
 *
 * A comma decimal separator is accepted because a numeric keypad in a
 * comma-decimal locale produces one, and rejecting "82,4" as "not a number"
 * would be the app's fault rather than the lifter's.
 */
function parseOptionalNumber(raw: string): number | null | 'invalid' {
  const text = raw.trim().replace(',', '.');
  if (text.length === 0) return null;
  if (!/^\d*\.?\d+$/.test(text)) return 'invalid';
  const value = Number(text);
  return Number.isFinite(value) ? value : 'invalid';
}

/** `numeric(6,2)` -- two decimals is what the column will keep. */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** `numeric(4,1)` for body fat; circumferences are stored to the same precision. */
function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** "82" rather than "82.0", "82.4" rather than "82.40". */
function trimNumber(value: number): string {
  return String(Math.round(value * 100) / 100);
}
