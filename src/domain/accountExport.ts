import type {
  BodyMeasurement,
  CheckIn,
  Exercise,
  PersonalRecord,
  Profile,
  Workout,
} from './types';

/**
 * ACCOUNT EXPORT
 * ==============
 * The export half of `Docs/invariants.md` I-10. Pure: it takes data that has
 * already been read and returns the document to hand over. No store, no
 * repository, no file system, no navigation.
 *
 * Same reasoning as `routing.ts` and `account.ts` — this repository has no
 * component-test tooling by decision, so a rule living inside a screen is a rule
 * with no coverage. What a lifter is owed when they ask for their data is a rule.
 *
 * WHAT AN EXPORT IS FOR
 * ---------------------
 * Two audiences, and they pull in different directions:
 *
 *   1. **The lifter**, who wants their training history somewhere they control
 *      and can still read in five years.
 *   2. **A store reviewer or a data-protection request**, which wants evidence
 *      that "everything you hold about me" is actually everything.
 *
 * Both are served by the same choice: emit the stored records themselves, in
 * full, rather than a prettified summary. Derived values (e1RM, volume, PRs that
 * could be recomputed) are *not* the point — but `personalRecords` is included
 * anyway, because it is a stored table, and an export that quietly omits a
 * stored table is the failure mode this exists to prevent.
 */

/**
 * Bumped when the shape changes in a way a reader would notice.
 *
 * Present from the first version on purpose. An export is a file that outlives
 * the app that wrote it: someone will open one of these long after this code is
 * gone, and a document that cannot say what it is is a document that has to be
 * reverse-engineered.
 */
export const ACCOUNT_EXPORT_FORMAT_VERSION = 1;

export interface AccountExport {
  formatVersion: number;
  /** ISO-8601. When the file was produced, not when the data was recorded. */
  exportedAt: string;
  profile: Profile;
  /**
   * Only movements this lifter created. PRism's seeded library is the app's
   * data, not theirs, and including several hundred system rows would bury the
   * handful that are actually personal.
   */
  customExercises: Exercise[];
  workouts: Workout[];
  checkIns: CheckIn[];
  measurements: BodyMeasurement[];
  personalRecords: PersonalRecord[];
}

export interface AccountExportSource {
  profile: Profile;
  exercises: Exercise[];
  workouts: Workout[];
  checkIns: CheckIn[];
  measurements: BodyMeasurement[];
  personalRecords: PersonalRecord[];
}

/**
 * Assemble the document.
 *
 * Everything is sorted, and the sort is part of the contract rather than an
 * incidental tidiness: two exports of unchanged data must be byte-identical, so
 * a lifter comparing this month's file to last month's sees only real changes.
 * A test asserts it.
 */
export function buildAccountExport(source: AccountExportSource, exportedAt: string): AccountExport {
  return {
    formatVersion: ACCOUNT_EXPORT_FORMAT_VERSION,
    exportedAt,
    profile: source.profile,
    customExercises: [...source.exercises]
      .filter((exercise) => !exercise.isSystem)
      .sort((a, b) => a.id.localeCompare(b.id)),
    workouts: [...source.workouts].sort((a, b) => a.startedAt.localeCompare(b.startedAt)),
    checkIns: [...source.checkIns].sort((a, b) => a.checkedInAt.localeCompare(b.checkedInAt)),
    measurements: [...source.measurements].sort((a, b) => a.measuredAt.localeCompare(b.measuredAt)),
    personalRecords: [...source.personalRecords].sort((a, b) =>
      a.achievedAt.localeCompare(b.achievedAt),
    ),
  };
}

/**
 * The file, as text.
 *
 * Indented rather than minified. The reader is a person opening it in whatever
 * they have to hand, and the size difference is irrelevant next to being able to
 * scroll it without tooling.
 */
export function serialiseAccountExport(exported: AccountExport): string {
  return JSON.stringify(exported, null, 2);
}

/**
 * `prism-export-2026-08-06.json`.
 *
 * Date only, no clock time: two exports on the same day collide by name, which
 * is the correct outcome — the second is a newer copy of the same thing, and a
 * folder of `prism-export-...T14-32-07.json` is a folder nobody can read.
 */
export function accountExportFilename(exported: AccountExport): string {
  const day = exported.exportedAt.slice(0, 10);
  return `prism-export-${day}.json`;
}

/**
 * Counts, for the screen that offers the export and the sheet that confirms a
 * deletion.
 *
 * The deletion confirmation names real numbers rather than saying "all your
 * data", because a lifter about to erase four years of training deserves to be
 * told what four years is. It comes from here so the sentence and the file
 * cannot disagree.
 */
export interface AccountDataSummary {
  workouts: number;
  sets: number;
  checkIns: number;
  measurements: number;
  personalRecords: number;
  customExercises: number;
}

export function summariseAccountExport(exported: AccountExport): AccountDataSummary {
  return {
    workouts: exported.workouts.length,
    sets: exported.workouts.reduce(
      (total, workout) =>
        total + workout.exercises.reduce((n, exercise) => n + exercise.sets.length, 0),
      0,
    ),
    checkIns: exported.checkIns.length,
    measurements: exported.measurements.length,
    personalRecords: exported.personalRecords.length,
    customExercises: exported.customExercises.length,
  };
}

/** True when there is nothing to export — a fresh account, or one already erased. */
export function isEmptyExport(exported: AccountExport): boolean {
  const summary = summariseAccountExport(exported);
  return (
    summary.workouts === 0 &&
    summary.checkIns === 0 &&
    summary.measurements === 0 &&
    summary.personalRecords === 0 &&
    summary.customExercises === 0
  );
}
