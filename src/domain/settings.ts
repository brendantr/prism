import { displayToKg, kgToDisplay } from './calc/loadRecommendation';
import type { Equipment, Experience, Goal, Profile, Routine, Unit } from './types';

/**
 * SETTINGS RULES
 * ==============
 * Everything the Settings screen decides, as pure functions. No store, no I/O.
 *
 * The screen itself has no test coverage available to it (no component-test
 * tooling, by decision), so anything that could be wrong lives here instead:
 * which plan is active, what choosing a plan actually writes, how a typed
 * bodyweight becomes kilograms, and what onboarding's answers mean for a
 * profile.
 */

export const TRAINING_DAYS_MIN = 1;
export const TRAINING_DAYS_MAX = 7;
export const BODYWEIGHT_MAX_KG = 500;
export const DISPLAY_NAME_MAX = 60;

// ---------------------------------------------------------------------------
// Which plan is active
// ---------------------------------------------------------------------------

/**
 * The lifter's plan, resolved in a stated order rather than by accident.
 *
 * What this replaces `[fact]`: `getActiveRoutine()` was
 * `routines.find(r => !r.isTemplate) ?? routines[0]`. Migration `0006` seeds
 * both PRism plans with `is_template = true`, so the `find` never matched and
 * every account fell through to `routines[0]` -- which, under the repository's
 * `.order('name')`, is "Prism 3" because P sorts before S. Nobody chose that,
 * and it is why a new account's hero could read "0 / 4 sessions" (from the
 * profile) above a week strip showing three planned days (from the routine).
 *
 * The order below is:
 *
 *   1. A routine the lifter marked active (`routines.is_active`).
 *   2. Any routine the lifter owns, by name -- they made it, they meant it.
 *   3. The PRism plan whose week matches the lifter's training-days target.
 *   4. The first plan by name, so the result is at least deterministic.
 *
 * Step 3 is what makes the two numbers agree: `trainingDaysPerWeek` is a real
 * choice the lifter makes in Settings or onboarding, and `Spectrum 4` and
 * `Prism 3` differ precisely in how many days a week they ask for. Ties are
 * broken by name so the result never depends on row order.
 */
export function selectActiveRoutine(
  routines: Routine[],
  profile: Profile | null,
): Routine | null {
  const byName = [...routines].sort((a, b) => a.name.localeCompare(b.name));

  const owned = byName.filter((r) => r.profileId != null);
  const flagged = owned.find((r) => r.isActive);
  if (flagged) return flagged;
  if (owned.length > 0) return owned[0];

  if (profile) {
    const matching = byName.find((r) => r.daysPerWeek === profile.trainingDaysPerWeek);
    if (matching) return matching;
  }

  return byName[0] ?? null;
}

/**
 * What choosing a plan has to write, given whose plan it is.
 *
 * **This is the sprint's one unresolved schema conflict, made explicit rather
 * than hidden inside a repository** (`Docs/sprints/2026-08-09-v1-user-data-writes.md` §7).
 *
 * `routines.is_active` is a column on the routine row. Every plan that exists
 * today is a PRism template with `profile_id = null` -- **one shared row read by
 * every account**. Setting `is_active` on it would not mean "Ana's plan", it
 * would mean "everyone's plan", and RLS refuses the write anyway
 * (`routines: write own`, `using (profile_id = auth.uid())`). So a template
 * choice cannot be stored as a flag on the template.
 *
 * It can be stored on the lifter's own profile, which they own outright, and
 * `selectActiveRoutine` step 3 reads it straight back. That is what the second
 * branch does -- and it is the same write the "sessions per week" control
 * makes, which is why the Settings screen puts the two side by side and says so
 * rather than doing it quietly.
 *
 * The first branch is the real thing, ready for the day a lifter owns a routine.
 */
export type PlanSelection =
  | { kind: 'activate'; routineId: string }
  | { kind: 'profile'; patch: Partial<Profile> };

export function planSelectionWrite(routine: Routine): PlanSelection {
  if (routine.profileId != null) return { kind: 'activate', routineId: routine.id };

  const patch: Partial<Profile> = { trainingDaysPerWeek: routine.daysPerWeek };
  const weekdays = routineWeekdays(routine);
  if (weekdays) patch.preferredWeekdays = weekdays;
  return { kind: 'profile', patch };
}

/**
 * The plan's pinned weekdays, or null when any day is a flexible rotation slot.
 *
 * All-or-nothing on purpose: a half-pinned plan would produce a week strip that
 * shows some sessions on fixed days and silently drops the rest.
 */
export function routineWeekdays(routine: Routine): number[] | null {
  const pinned = routine.days.map((d) => d.weekday).filter((w): w is number => w != null);
  if (pinned.length === 0 || pinned.length !== routine.days.length) return null;
  return [...new Set(pinned)].sort((a, b) => a - b);
}

// ---------------------------------------------------------------------------
// Profile fields
// ---------------------------------------------------------------------------

export type BodyweightParse =
  | { ok: true; kg: number | null }
  | { ok: false };

/**
 * A typed bodyweight, in whatever unit the lifter is using, as kilograms.
 *
 * Empty is a valid answer and clears the field -- a lifter who does not want to
 * record their bodyweight should not have to invent one. `profiles.bodyweight_kg`
 * is nullable, so null round-trips cleanly.
 */
export function parseBodyweight(raw: string, unit: Unit): BodyweightParse {
  const text = raw.trim().replace(',', '.');
  if (text.length === 0) return { ok: true, kg: null };
  if (!/^\d*\.?\d+$/.test(text)) return { ok: false };

  const value = Number(text);
  if (!Number.isFinite(value) || value <= 0) return { ok: false };

  const kg = Math.round(displayToKg(value, unit) * 100) / 100;
  if (kg <= 0 || kg > BODYWEIGHT_MAX_KG) return { ok: false };
  return { ok: true, kg };
}

/** The stored kilograms as a field value in the lifter's own unit. */
export function bodyweightFieldValue(kg: number | null, unit: Unit): string {
  if (kg == null) return '';
  return String(Math.round(kgToDisplay(kg, unit) * 100) / 100);
}

export type DisplayNameValidation =
  | { ok: true; value: string }
  | { ok: false; problem: 'missing' | 'too_long' };

/** Match migration 0002's trim/non-empty/60-character contract before I/O. */
export function validateDisplayName(raw: string): DisplayNameValidation {
  const value = raw.trim().replace(/\s+/g, ' ');
  if (value.length === 0) return { ok: false, problem: 'missing' };
  if (value.length > DISPLAY_NAME_MAX) return { ok: false, problem: 'too_long' };
  return { ok: true, value };
}

/**
 * Add or remove one ISO weekday, keeping the list sorted and unique.
 *
 * Sorted because `preferred_weekdays` feeds the week strip, which renders
 * Monday-first regardless of tap order, and unique because the column is a
 * plain `smallint[]` with no set semantics.
 */
export function toggleWeekday(weekdays: number[], weekday: number): number[] {
  const next = new Set(weekdays);
  if (next.has(weekday)) next.delete(weekday);
  else next.add(weekday);
  return [...next].sort((a, b) => a - b);
}

export function clampTrainingDays(value: number): number {
  if (!Number.isFinite(value)) return TRAINING_DAYS_MIN;
  return Math.min(TRAINING_DAYS_MAX, Math.max(TRAINING_DAYS_MIN, Math.round(value)));
}

// ---------------------------------------------------------------------------
// Onboarding hand-off
// ---------------------------------------------------------------------------

/**
 * What onboarding collected, structurally.
 *
 * Declared here rather than imported from `src/store/onboardingStore.ts` on
 * purpose: `src/domain/` must not depend on a store, or the rules stop being
 * testable without one. `OnboardingSelections` satisfies this shape, and a
 * change to either that breaks the other is a compile error at the call site.
 */
export interface OnboardingAnswers {
  goal: Goal | null;
  experience: Experience | null;
  trainingDaysPerWeek: number | null;
  availableEquipment: Equipment[];
}

/**
 * Onboarding's answers, as a profile patch.
 *
 * What this fixes `[fact]`: `onboardingStore` recorded goal, experience,
 * training days and equipment and then said, in its own doc-comment, that they
 * were "NOT yet applied to the user's profile"; `app/onboarding/steps.tsx`
 * repeated it. Four questions were asked on first run and thrown away, so every
 * account stayed on `handle_new_user`'s defaults forever.
 *
 * A skipped question contributes **no key at all**, not a default. That is the
 * same rule the onboarding screens already follow ("Skipping advances without
 * recording an answer -- it does not write a default") and the same rule the
 * check-in patch follows: an omitted property must not overwrite a stored one.
 * It matters here because the profile a new account starts with is not empty --
 * it is `handle_new_user`'s defaults -- and a skipped question writing a
 * middling stand-in would be indistinguishable from a real choice later.
 */
export function profilePatchFromOnboarding(selections: OnboardingAnswers): Partial<Profile> {
  const patch: Partial<Profile> = {};
  if (selections.goal != null) patch.goal = selections.goal;
  if (selections.experience != null) patch.experience = selections.experience;
  if (selections.trainingDaysPerWeek != null) {
    patch.trainingDaysPerWeek = clampTrainingDays(selections.trainingDaysPerWeek);
  }
  if (selections.availableEquipment.length > 0) {
    patch.availableEquipment = [...selections.availableEquipment];
  }
  return patch;
}

/** Nothing to write -- lets a caller skip the round trip entirely. */
export function isEmptyProfilePatch(patch: Partial<Profile>): boolean {
  return Object.keys(patch).length === 0;
}
