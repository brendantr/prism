import AsyncStorage from '@react-native-async-storage/async-storage';
import { EXERCISE_LIBRARY } from './exerciseLibrary';
import { ROUTINE_TEMPLATES, SPECTRUM_FOUR } from './routineTemplates';
import { generateDemoData, DEMO_PROFILE_ID } from './demoSeed';
import { AuthRequiredError } from './authRequired';
import { buildAccountExport, type AccountExport } from '@/domain/accountExport';
import { deviceLocalDate, isLocalDate } from '@/domain/trainingDay';
import {
  DEMO_MODE,
  SUPABASE_MISCONFIGURED,
  SUPABASE_MISCONFIGURED_MESSAGE,
  getSupabase,
  isSupabaseConfigured,
} from './supabase/client';
import {
  fromPersonalRecord,
  fromProfile,
  fromWorkoutGraph,
  toCheckIn,
  toExercise,
  toMeasurement,
  toPersonalRecord,
  toProfile,
  toWorkout,
} from './supabase/mappers';
import type {
  BodyMeasurement,
  CheckIn,
  CheckInPatch,
  Exercise,
  PersonalRecord,
  Profile,
  Routine,
  Workout,
} from '@/domain/types';

/**
 * REPOSITORY
 * ==========
 * One interface, two implementations. The UI only ever sees this interface, so
 * a screen written against demo data works unchanged against Supabase.
 *
 *   DemoRepository     -- deterministic seeded data in memory, with any workout
 *                         you log persisted to AsyncStorage so demo mode still
 *                         feels like a real app across restarts.
 *   SupabaseRepository -- Postgres + RLS. Reads are nested selects; writes are
 *                         upserts that mirror the local object graph.
 */

export interface Repository {
  readonly kind: 'demo' | 'supabase';
  getProfile(): Promise<Profile>;
  updateProfile(patch: Partial<Profile>): Promise<Profile>;
  listExercises(): Promise<Exercise[]>;
  listRoutines(): Promise<Routine[]>;
  getActiveRoutine(): Promise<Routine | null>;
  listWorkouts(): Promise<Workout[]>;
  saveWorkout(workout: Workout): Promise<void>;
  /**
   * Finish a session: the workout graph and the records it set, as ONE
   * operation that either happens or does not.
   *
   * Separate from `saveWorkout` + `savePersonalRecords` because those are two
   * round trips, and finishing was landing them one at a time -- the workout
   * committing while the records failed, then a retry re-deriving the records
   * with fresh ids and inserting them a second time. `Docs/invariants.md` I-2
   * covers the workout graph; the records are part of the same user action and
   * belong in the same transaction.
   *
   * Callers pass the records they detected; the implementation is responsible
   * for making a repeat call a no-op rather than a duplicate.
   */
  completeWorkout(workout: Workout, records: PersonalRecord[]): Promise<void>;
  deleteWorkout(id: string): Promise<void>;
  listCheckIns(): Promise<CheckIn[]>;
  /** Accepts a partial submission; see `CheckInPatch` for omit/clear semantics. */
  saveCheckIn(patch: CheckInPatch): Promise<void>;
  listMeasurements(): Promise<BodyMeasurement[]>;
  listPersonalRecords(): Promise<PersonalRecord[]>;
  savePersonalRecords(records: PersonalRecord[]): Promise<void>;

  /**
   * Everything this account holds, as one document (`Docs/invariants.md` I-10).
   *
   * A method rather than "call the six list methods from the screen", because
   * the guarantee I-10 asks for is *completeness*: a table added later must not
   * be able to fall out of the export because a caller forgot it. One place to
   * update, next to the interface that names the tables.
   */
  exportAccountData(): Promise<AccountExport>;

  /**
   * Permanently erase this account and everything it owns (I-10).
   *
   * Irreversible, and takes no arguments — the implementation derives the
   * account from the session, never from a caller-supplied id. Idempotent:
   * deleting an account that is already gone succeeds, so a retry after a lost
   * response is safe.
   */
  deleteAccount(): Promise<void>;
}

// ---------------------------------------------------------------------------
// Demo
// ---------------------------------------------------------------------------

const STORAGE_KEYS = {
  workouts: 'prism.demo.workouts.v1',
  profile: 'prism.demo.profile.v1',
  records: 'prism.demo.records.v1',
  checkIns: 'prism.demo.checkins.v1',
} as const;

class DemoRepository implements Repository {
  readonly kind = 'demo' as const;

  private dataset = generateDemoData();
  private hydrated = false;
  /** Workouts logged inside the demo, kept separate from generated history. */
  private userWorkouts: Workout[] = [];
  private userRecords: PersonalRecord[] = [];
  private userCheckIns: CheckIn[] = [];
  private profileOverride: Partial<Profile> = {};

  private async hydrate(): Promise<void> {
    if (this.hydrated) return;
    this.hydrated = true;
    try {
      const [w, p, r, c] = await AsyncStorage.multiGet([
        STORAGE_KEYS.workouts,
        STORAGE_KEYS.profile,
        STORAGE_KEYS.records,
        STORAGE_KEYS.checkIns,
      ]);
      this.userWorkouts = safeParse<Workout[]>(w[1], []);
      this.profileOverride = safeParse<Partial<Profile>>(p[1], {});
      this.userRecords = safeParse<PersonalRecord[]>(r[1], []);
      // `localDate` was added after the v1 demo-storage key shipped. Old demo
      // records have only an instant, so derive the best available local date
      // on hydration rather than dropping a lifter's locally logged check-ins.
      this.userCheckIns = safeParse<Array<CheckIn & { localDate?: string }>>(c[1], []).map(
        (checkIn) => ({
          ...checkIn,
          localDate: isLocalDate(checkIn.localDate)
            ? checkIn.localDate
            : deviceLocalDate(checkIn.checkedInAt),
        }),
      );
    } catch {
      // A corrupt cache should never block the app; fall back to pure seed data.
      this.userWorkouts = [];
    }
  }

  async getProfile(): Promise<Profile> {
    await this.hydrate();
    return { ...this.dataset.profile, ...this.profileOverride };
  }

  async updateProfile(patch: Partial<Profile>): Promise<Profile> {
    await this.hydrate();
    this.profileOverride = { ...this.profileOverride, ...patch };
    await AsyncStorage.setItem(STORAGE_KEYS.profile, JSON.stringify(this.profileOverride));
    return this.getProfile();
  }

  async listExercises(): Promise<Exercise[]> {
    return EXERCISE_LIBRARY;
  }

  async listRoutines(): Promise<Routine[]> {
    return ROUTINE_TEMPLATES;
  }

  async getActiveRoutine(): Promise<Routine> {
    return SPECTRUM_FOUR;
  }

  async listWorkouts(): Promise<Workout[]> {
    await this.hydrate();
    return [...this.dataset.workouts, ...this.userWorkouts].sort((a, b) =>
      a.startedAt.localeCompare(b.startedAt),
    );
  }

  async saveWorkout(workout: Workout): Promise<void> {
    await this.hydrate();
    const i = this.userWorkouts.findIndex((w) => w.id === workout.id);
    if (i >= 0) this.userWorkouts[i] = workout;
    else this.userWorkouts.push(workout);
    await AsyncStorage.setItem(STORAGE_KEYS.workouts, JSON.stringify(this.userWorkouts));
  }

  /**
   * Demo-mode equivalent of the Postgres `save_workout_graph` transaction.
   *
   * Two properties have to hold here for the same reasons they hold there, or
   * demo mode stops being a faithful rehearsal of the real path:
   *
   *   ATOMIC -- both keys are written with one `multiSet`, and the in-memory
   *   arrays are only replaced once that resolves. The old code mutated the
   *   array first and awaited afterwards, so a storage rejection left the
   *   process believing it had saved something that was not on disk.
   *
   *   IDEMPOTENT -- a record is keyed by (workout, exercise, kind), matching
   *   the `personal_records_session_unique` index. A retry after a failure
   *   re-derives the same records with fresh ids, and must not add a second
   *   copy of each.
   */
  async completeWorkout(workout: Workout, records: PersonalRecord[]): Promise<void> {
    await this.hydrate();

    const nextWorkouts = [...this.userWorkouts.filter((w) => w.id !== workout.id), workout];

    const key = (r: PersonalRecord) => `${r.workoutId}:${r.exerciseId}:${r.kind}`;
    const seen = new Set(this.userRecords.map(key));
    const added = records.filter((r) => !seen.has(key(r)));
    const nextRecords = [...this.userRecords, ...added];

    await AsyncStorage.multiSet([
      [STORAGE_KEYS.workouts, JSON.stringify(nextWorkouts)],
      [STORAGE_KEYS.records, JSON.stringify(nextRecords)],
    ]);

    this.userWorkouts = nextWorkouts;
    this.userRecords = nextRecords;
  }

  async deleteWorkout(id: string): Promise<void> {
    await this.hydrate();
    this.userWorkouts = this.userWorkouts.filter((w) => w.id !== id);
    await AsyncStorage.setItem(STORAGE_KEYS.workouts, JSON.stringify(this.userWorkouts));
  }

  async listCheckIns(): Promise<CheckIn[]> {
    await this.hydrate();
    const byId = new Map(this.dataset.checkIns.map((c) => [c.id, c]));
    for (const c of this.userCheckIns) byId.set(c.id, c);
    return [...byId.values()].sort((a, b) => a.checkedInAt.localeCompare(b.checkedInAt));
  }

  /**
   * One check-in per captured local calendar date, built up a few taps at a time.
   *
   * A later submission on the same day merges into the existing record instead
   * of adding a second one -- matching the `check_ins_one_per_day` unique index
   * the Postgres schema already enforces, and keeping `selectLatestCheckIn`
   * from picking a thin afternoon entry over a fuller morning one.
   */
  async saveCheckIn(patch: CheckInPatch): Promise<void> {
    await this.hydrate();
    const normalized = withCheckInLocalDate(patch);
    const today = (await this.listCheckIns()).find(
      (c) => c.localDate === normalized.localDate,
    );
    const record = mergeCheckIn(today ? today : blankCheckIn(normalized), normalized);
    this.userCheckIns = [...this.userCheckIns.filter((c) => c.id !== record.id), record];
    await AsyncStorage.setItem(STORAGE_KEYS.checkIns, JSON.stringify(this.userCheckIns));
  }

  async listMeasurements(): Promise<BodyMeasurement[]> {
    return this.dataset.measurements;
  }

  async listPersonalRecords(): Promise<PersonalRecord[]> {
    await this.hydrate();
    return [...this.dataset.personalRecords, ...this.userRecords].sort((a, b) =>
      a.achievedAt.localeCompare(b.achievedAt),
    );
  }

  async savePersonalRecords(records: PersonalRecord[]): Promise<void> {
    await this.hydrate();
    this.userRecords.push(...records);
    await AsyncStorage.setItem(STORAGE_KEYS.records, JSON.stringify(this.userRecords));
  }

  async exportAccountData(): Promise<AccountExport> {
    await this.hydrate();
    return buildAccountExport(
      {
        profile: await this.getProfile(),
        exercises: await this.listExercises(),
        workouts: await this.listWorkouts(),
        checkIns: await this.listCheckIns(),
        measurements: await this.listMeasurements(),
        personalRecords: await this.listPersonalRecords(),
      },
      new Date().toISOString(),
    );
  }

  /**
   * Demo mode has no account, so this is the closest honest equivalent: erase
   * everything stored on the device and return to the pristine seed.
   *
   * The screen that offers deletion is gated on an authenticated session and is
   * therefore unreachable in a demo build (`canOfferSignOut`, and the account
   * route behind it). This exists so the interface has one meaning in both
   * implementations rather than a method that throws in one of them.
   */
  async deleteAccount(): Promise<void> {
    await this.resetDemo();
  }

  /** Wipe locally logged demo data and return to the pristine seed. */
  async resetDemo(): Promise<void> {
    await AsyncStorage.multiRemove(Object.values(STORAGE_KEYS));
    this.userWorkouts = [];
    this.userRecords = [];
    this.userCheckIns = [];
    this.profileOverride = {};
    this.dataset = generateDemoData();
  }
}

// ---------------------------------------------------------------------------
// Supabase
// ---------------------------------------------------------------------------

const WORKOUT_SELECT = `
  id, profile_id, routine_day_id, title, status, started_at, ended_at, reflection, session_rating,
  workout_exercises (
    id, workout_id, exercise_id, order_index, notes,
    sets ( id, workout_exercise_id, set_index, type, weight_kg, reps, rpe, completed, rest_seconds, notes )
  )
`;

class SupabaseRepository implements Repository {
  readonly kind = 'supabase' as const;

  /**
   * The signed-in user's id, and the only source of identity in this class.
   *
   * Two changes from the original, both deliberate:
   *
   * 1. `getSession()` rather than `getUser()`. `getUser()` makes a network
   *    round-trip per call, and `trainingStore.refresh()` fans out eight
   *    repository calls at once, six of which land here -- six requests before
   *    any data is fetched. RLS evaluates the access token server-side on every
   *    query anyway, so a second client-side validation proves nothing the
   *    query itself will not (`Docs/invariants.md` I-1, I-6).
   * 2. `AuthRequiredError` rather than a bare `Error`. The store layer has to
   *    be able to route "no session" to sign-in instead of rendering a retry
   *    that cannot succeed. See `src/data/authRequired.ts`.
   */
  private async uid(): Promise<string> {
    const { data, error } = await getSupabase().auth.getSession();
    if (error || !data.session?.user) throw new AuthRequiredError();
    return data.session.user.id;
  }

  async getProfile(): Promise<Profile> {
    const id = await this.uid();
    const { data, error } = await getSupabase().from('profiles').select('*').eq('id', id).single();
    if (error) throw error;
    return toProfile(data);
  }

  async updateProfile(patch: Partial<Profile>): Promise<Profile> {
    const id = await this.uid();
    const { data, error } = await getSupabase()
      .from('profiles')
      .update(fromProfile(patch))
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return toProfile(data);
  }

  async listExercises(): Promise<Exercise[]> {
    const { data, error } = await getSupabase().from('exercises').select('*').order('name');
    if (error) throw error;
    return (data ?? []).map(toExercise);
  }

  async listRoutines(): Promise<Routine[]> {
    const { data, error } = await getSupabase()
      .from('routines')
      .select(
        'id, profile_id, name, description, days_per_week, is_template, is_active, routine_days (id, routine_id, name, day_index, weekday, routine_exercises (*))',
      )
      .order('name');
    if (error) throw error;
    return (data ?? []).map(toRoutine);
  }

  async getActiveRoutine(): Promise<Routine | null> {
    const routines = await this.listRoutines();
    return routines.find((r) => !r.isTemplate) ?? routines[0] ?? null;
  }

  async listWorkouts(): Promise<Workout[]> {
    const id = await this.uid();
    const { data, error } = await getSupabase()
      .from('workouts')
      .select(WORKOUT_SELECT)
      .eq('profile_id', id)
      .order('started_at', { ascending: true });
    if (error) throw error;
    return (data ?? []).map(toWorkout);
  }

  /**
   * Persist a workout and its whole object graph, in one transaction.
   *
   * This used to be three sequential upserts -- `workouts`, then
   * `workout_exercises`, then `sets` -- with nothing spanning them. Each was
   * atomic alone, so a failure at the second or third left the lifter looking
   * at "could not save" over a session that was half committed: a workout row
   * with no exercises, or exercises with no sets. It was also additive only,
   * so removing an exercise in the logger left the old row in Postgres and the
   * next read brought it back. That is `Docs/architecture.md` G-2 and
   * `Docs/invariants.md` I-2.
   *
   * `save_workout_graph` does all of it inside one transaction and treats the
   * payload as authoritative, deleting the children it no longer contains. It
   * is `security invoker`, so RLS applies exactly as it did to the individual
   * statements and ownership still comes from the session -- see
   * `supabase/migrations/0003_workout_write_integrity.sql`.
   */
  async saveWorkout(workout: Workout): Promise<void> {
    await this.saveGraph(workout, []);
  }

  /**
   * The same transaction, carrying the records the session set.
   *
   * Finishing used to be two round trips: save the workout, then insert the
   * PRs. When the second failed the lifter was told the session had not saved,
   * retried, and the PR ids were re-minted -- so if the original insert had in
   * fact committed and only its response was lost, the retry wrote a second
   * copy. The records now go in the same transaction, keyed by
   * (workout, exercise, kind) so a repeat call is a no-op.
   */
  async completeWorkout(workout: Workout, records: PersonalRecord[]): Promise<void> {
    await this.saveGraph(workout, records);
  }

  private async saveGraph(workout: Workout, records: PersonalRecord[]): Promise<void> {
    // Fails closed with AuthRequiredError when there is no session, matching
    // every other write here -- the function refuses an anonymous call too,
    // but erroring before the round trip says why without one.
    await this.uid();
    const { error } = await getSupabase().rpc('save_workout_graph', {
      p_workout: fromWorkoutGraph(workout),
      p_records: records.map(fromPersonalRecord),
    });
    if (error) throw error;
  }

  async deleteWorkout(id: string): Promise<void> {
    const profileId = await this.uid();
    // Scoped by owner as well as id. RLS already limits the delete to your own
    // rows, so this changes no outcome -- it means a bug in one layer is not
    // the only thing standing between a stray id and someone else's session.
    const { error } = await getSupabase()
      .from('workouts')
      .delete()
      .eq('id', id)
      .eq('profile_id', profileId);
    if (error) throw error;
  }

  async listCheckIns(): Promise<CheckIn[]> {
    const id = await this.uid();
    const { data, error } = await getSupabase()
      .from('check_ins')
      .select('*')
      .eq('profile_id', id)
      .order('checked_in_at', { ascending: true });
    if (error) throw error;
    return (data ?? []).map(toCheckIn);
  }

  /**
   * A partial check-in, merged into today's record by the database.
   *
   * This used to call `assertCompleteCheckIn` and **throw** unless all four
   * scales were answered, because `check_ins` declared them `not null`. So a
   * feature I-7 defines as optional field by field worked in demo mode and
   * failed against a real backend -- and `CheckInPrompt` enables submit as soon
   * as *any* one scale is answered, so it was reachable on the first tap.
   * `0004_partial_check_ins.sql` makes the columns nullable and adds
   * `save_check_in`.
   *
   * The payload is built by key presence, not by value, and that is the whole
   * subtlety. `CheckInPatch` distinguishes a property the caller omitted from
   * one they sent as null: the first means "leave my earlier answer alone", the
   * second means "erase it". A plain upsert flattens both into a column value
   * and cannot say which was meant, which is why this sends jsonb to a function
   * that tests `p_patch ? 'energy'` instead.
   *
   * Ownership is not sent at all -- the function reads `auth.uid()`.
   */
  async saveCheckIn(checkIn: CheckInPatch): Promise<void> {
    await this.uid();
    const normalized = withCheckInLocalDate(checkIn);

    const patch: Record<string, unknown> = {
      id: normalized.id,
      local_date: normalized.localDate,
      checked_in_at: normalized.checkedInAt,
    };
    for (const field of CHECK_IN_SCALES) {
      // `in`, not a truthiness or null test: an explicitly-null answer has to
      // reach the database as a present key so it clears the stored value.
      if (field in normalized) patch[CHECK_IN_COLUMN[field]] = normalized[field] ?? null;
    }

    const { error } = await getSupabase().rpc('save_check_in', { p_patch: patch });
    if (error) throw error;
  }

  async listMeasurements(): Promise<BodyMeasurement[]> {
    const id = await this.uid();
    const { data, error } = await getSupabase()
      .from('body_measurements')
      .select('*')
      .eq('profile_id', id)
      .order('measured_at', { ascending: true });
    if (error) throw error;
    return (data ?? []).map(toMeasurement);
  }

  async listPersonalRecords(): Promise<PersonalRecord[]> {
    const id = await this.uid();
    const { data, error } = await getSupabase()
      .from('personal_records')
      .select('*')
      .eq('profile_id', id)
      .order('achieved_at', { ascending: true });
    if (error) throw error;
    return (data ?? []).map(toPersonalRecord);
  }

  async savePersonalRecords(records: PersonalRecord[]): Promise<void> {
    if (records.length === 0) return;
    const profileId = await this.uid();
    const { error } = await getSupabase().from('personal_records').insert(
      records.map((r) => ({
        id: r.id,
        profile_id: profileId,
        exercise_id: r.exerciseId,
        kind: r.kind,
        value: r.value,
        reps: r.reps,
        weight_kg: r.weightKg,
        achieved_at: r.achievedAt,
        workout_id: r.workoutId,
      })),
    );
    if (error) throw error;
  }

  /**
   * Every row RLS lets this session see, assembled into one document.
   *
   * The reads run in parallel and are individually already owner-scoped -- each
   * list method filters on the session uid and Postgres enforces it again -- so
   * this adds no new authorization surface. It is a fan-out, not a privilege.
   */
  async exportAccountData(): Promise<AccountExport> {
    const [profile, exercises, workouts, checkIns, measurements, personalRecords] =
      await Promise.all([
        this.getProfile(),
        this.listExercises(),
        this.listWorkouts(),
        this.listCheckIns(),
        this.listMeasurements(),
        this.listPersonalRecords(),
      ]);

    return buildAccountExport(
      { profile, exercises, workouts, checkIns, measurements, personalRecords },
      new Date().toISOString(),
    );
  }

  /**
   * Delete the account, via `delete_my_account`
   * (`supabase/migrations/0005_account_deletion.sql`).
   *
   * No arguments are sent and none can be: the function takes none, and derives
   * the account from `auth.uid()`. That is the containment on the one
   * `security definer` function in this schema -- there is no id here to get
   * wrong, and no id the server would accept if there were.
   *
   * `uid()` first so an unauthenticated call fails with `AuthRequiredError`
   * rather than a database error, matching every other write here.
   */
  async deleteAccount(): Promise<void> {
    await this.uid();
    const { error } = await getSupabase().rpc('delete_my_account');
    if (error) throw error;
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function toRoutine(row: any): Routine {
  return {
    id: row.id,
    profileId: row.profile_id ?? null,
    name: row.name,
    description: row.description ?? '',
    daysPerWeek: row.days_per_week,
    isTemplate: row.is_template,
    days: (row.routine_days ?? [])
      .map((d: any) => ({
        id: d.id,
        routineId: d.routine_id,
        name: d.name,
        dayIndex: d.day_index,
        weekday: d.weekday ?? null,
        exercises: (d.routine_exercises ?? [])
          .map((e: any) => ({
            id: e.id,
            routineDayId: e.routine_day_id,
            exerciseId: e.exercise_id,
            orderIndex: e.order_index,
            targetSets: e.target_sets,
            targetRepsLow: e.target_reps_low,
            targetRepsHigh: e.target_reps_high,
            targetRpe: e.target_rpe == null ? null : Number(e.target_rpe),
            restSeconds: e.rest_seconds,
          }))
          .sort((a: any, b: any) => a.orderIndex - b.orderIndex),
      }))
      .sort((a: any, b: any) => a.dayIndex - b.dayIndex),
  };
}

// ---------------------------------------------------------------------------
// Check-in helpers
// ---------------------------------------------------------------------------

/** The four self-reported scales, all independently optional. */
const CHECK_IN_SCALES = ['sleepQuality', 'energy', 'soreness', 'stress'] as const;

/**
 * Domain field -> column, for the one place a check-in crosses into SQL.
 *
 * Written as a map rather than inline string literals so that adding a fifth
 * scale is a type error here instead of a silently-dropped field at the write
 * boundary -- which is the failure `CheckInPatch`'s own comment warns about.
 */
const CHECK_IN_COLUMN: Record<(typeof CHECK_IN_SCALES)[number], string> = {
  sleepQuality: 'sleep_quality',
  energy: 'energy',
  soreness: 'soreness',
  stress: 'stress',
};

/**
 * The TypeScript contract requires `localDate`; the fallback is for a caller
 * from an older in-process bundle or persisted action shape. It still computes
 * the date on the client, from the event instant and this device's timezone,
 * and both repositories use this same boundary so demo and Supabase agree.
 */
function withCheckInLocalDate(patch: CheckInPatch): CheckInPatch {
  const supplied = (patch as CheckInPatch & { localDate?: unknown }).localDate;
  const localDate = supplied == null ? deviceLocalDate(patch.checkedInAt) : supplied;
  if (!isLocalDate(localDate)) {
    throw new RangeError('Check-in localDate must be a real YYYY-MM-DD date.');
  }
  return { ...patch, localDate };
}

/**
 * Patch semantics, keyed on whether the property is present at all:
 *
 *   omitted        keep the stored answer
 *   1-5            overwrite the stored answer
 *   null           clear the stored answer
 *
 * `in` is doing the real work here. `??` (or any other undefined/null fallback)
 * would treat a deliberate clear as if the lifter had simply not answered, and
 * the old value would reappear on the next read.
 */
function mergeCheckIn(existing: CheckIn, patch: CheckInPatch): CheckIn {
  const merged: CheckIn = {
    ...existing,
    localDate: patch.localDate,
    checkedInAt: patch.checkedInAt,
  };

  for (const field of CHECK_IN_SCALES) {
    if (!(field in patch)) continue;
    const value = patch[field];
    merged[field] = value === undefined ? null : value;
  }

  return merged;
}

/** A record with nothing answered yet, for a day with no check-in so far. */
function blankCheckIn(patch: CheckInPatch): CheckIn {
  return {
    id: patch.id,
    profileId: patch.profileId,
    localDate: patch.localDate,
    checkedInAt: patch.checkedInAt,
    sleepQuality: null,
    energy: null,
    soreness: null,
    stress: null,
  };
}

// `assertCompleteCheckIn` lived here. It refused any check-in missing a scale,
// because `check_ins` declared all four `not null`. 0004 made the columns
// nullable and moved the merge into `save_check_in`, so the guard is gone
// rather than relaxed -- there is no longer a case it would have caught.

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let instance: Repository | null = null;

export function getRepository(): Repository {
  // Demo-off-but-unconfigured is a build mistake, not a mode. Returning a
  // DemoRepository here is what made it invisible: the app would run, look
  // live, and quietly keep every session on one device. `trainingStore.refresh`
  // calls this inside its try block, so the throw lands as the ordinary
  // retryable error state every screen already renders (`ScreenState`).
  if (SUPABASE_MISCONFIGURED) throw new Error(SUPABASE_MISCONFIGURED_MESSAGE);

  if (!instance) {
    instance = isSupabaseConfigured ? new SupabaseRepository() : new DemoRepository();
  }
  return instance;
}

/**
 * Drop the cached repository so the next `getRepository()` builds a fresh one.
 *
 * **Defence in depth, not the fix.** `SupabaseRepository` holds no state -- it
 * re-derives identity from the session on every call -- so resetting it changes
 * nothing observable today. The data that actually survives a sign-out is
 * `trainingStore`'s populated arrays and the local workout draft, and those are
 * cleared explicitly (`src/store/authActions.ts`). This exists so that the day
 * someone caches a profile id or a client handle on the instance, the teardown
 * path already covers it rather than needing to be rediscovered.
 */
export function resetRepository(): void {
  instance = null;
}

/**
 * Read straight off the flag rather than constructing a repository: this is
 * called during render (Today's "Demo data" chip), and a render path must not
 * be able to throw on a misconfigured build.
 */
export function isDemoMode(): boolean {
  return DEMO_MODE;
}

export async function resetDemoData(): Promise<void> {
  const repo = getRepository();
  if (repo instanceof DemoRepository) await repo.resetDemo();
}

export { DEMO_MODE, DEMO_PROFILE_ID };

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
