import AsyncStorage from '@react-native-async-storage/async-storage';
import { EXERCISE_LIBRARY } from './exerciseLibrary';
import { ROUTINE_TEMPLATES } from './routineTemplates';
import { newId } from '@/utils/id';
import { generateDemoData, DEMO_PROFILE_ID } from './demoSeed';
import { AuthRequiredError } from './authRequired';
import {
  ExerciseInUseError,
  RoutineNotSelectableError,
  isForeignKeyViolation,
} from './repositoryErrors';
import { buildAccountExport, type AccountExport } from '@/domain/accountExport';
import { selectActiveRoutine } from '@/domain/settings';
import { PRO_ENTITLEMENT_ID, type EntitlementRecord } from '@/domain/entitlements';
import { deviceLocalDate, isLocalDate } from '@/domain/trainingDay';
import type { CustomExerciseInput } from '@/domain/customExercise';
import {
  DEMO_MODE,
  SUPABASE_MISCONFIGURED,
  SUPABASE_MISCONFIGURED_MESSAGE,
  getSupabase,
  isSupabaseConfigured,
} from './supabase/client';
import {
  fromCustomExercise,
  fromMeasurement,
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

  /**
   * Add a movement of the lifter's own.
   *
   * Returns the stored row rather than void, because the caller needs the id
   * the write produced -- typically to add the movement straight into the
   * session they were logging when they discovered PRism did not know it.
   *
   * Ownership is never a parameter. `exercises.profile_id` is set from the
   * session; a null there is the world-readable PRism library and no client
   * may write one (`Docs/invariants.md` I-6, and the `exercises: insert own`
   * policy in `0001_init.sql`).
   */
  createExercise(input: CustomExerciseInput): Promise<Exercise>;

  /** Edit one of the lifter's own movements. Rejects a PRism library row. */
  updateExercise(id: string, input: CustomExerciseInput): Promise<Exercise>;

  /**
   * Delete one of the lifter's own movements.
   *
   * Throws `ExerciseInUseError` when logged sets still reference it. That is
   * not a bug to work around: `0007_deletable_account_with_custom_exercises.sql`
   * chose a deferrable `no action` foreign key over `cascade` specifically so
   * deleting a movement cannot silently destroy the sets performed with it.
   */
  deleteExercise(id: string): Promise<void>;

  listRoutines(): Promise<Routine[]>;
  getActiveRoutine(): Promise<Routine | null>;

  /**
   * Mark a routine as this lifter's active plan (`routines.is_active`).
   *
   * Throws `RoutineNotSelectableError` for a PRism template, which is a single
   * shared row (`profile_id is null`) read by every account -- a per-lifter flag
   * on it is not expressible, and RLS refuses the write. `planSelectionWrite`
   * in `src/domain/settings.ts` is what the app calls instead, and
   * `Docs/sprints/2026-08-09-v1-user-data-writes.md` §7 records the open
   * decision behind that.
   */
  setActiveRoutine(routineId: string): Promise<void>;

  /**
   * Completed and in-progress sessions, oldest first.
   *
   * `limit` caps the result to the **most recent** N sessions. Omitting it
   * returns everything, and that default is deliberate: the two callers that
   * must not be bounded are `exportAccountData` (I-10 promises the export is
   * complete, and the privacy policy says "export everything") and
   * `DemoRepository.deleteExercise`, which refuses to delete a movement any
   * logged session references — a session from three years ago still counts.
   * A bounded default would have broken both silently rather than loudly.
   *
   * The bound exists because the app used to load every session, every
   * exercise block and every set on every cold start, three levels deep with
   * no limit. That cost grows linearly with how long someone has trained, so
   * the most committed lifters got the slowest app.
   *
   * Ordering is unchanged (oldest first) so callers that scan forward are
   * unaffected; the limit is applied to the newest rows and the window is then
   * returned in the usual order.
   */
  listWorkouts(options?: { limit?: number }): Promise<Workout[]>;
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

  /**
   * Store a body measurement, creating or replacing the record with that id.
   *
   * Every field on the record is independently nullable, and a null means "not
   * measured" rather than zero -- the same rule the check-in scales follow
   * (I-7). Unlike a check-in there is no merge semantics to preserve: a
   * measurement is one moment, the form shows every field it stores, and the
   * caller has already merged any circumference site it does not display
   * (`validateMeasurement`).
   */
  saveMeasurement(measurement: BodyMeasurement): Promise<void>;
  deleteMeasurement(id: string): Promise<void>;

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

  /**
   * THE SERVER'S ANSWER on whether this account has paid (`Docs/invariants.md` I-9).
   *
   * Read-only from the client's side, and that is the entire point of the
   * method: there is no `saveEntitlement`, no `grantEntitlement`, and no
   * argument anywhere in this interface that could assert one. The row is
   * written only by the RevenueCat webhook using the service-role key
   * server-side (`supabase/functions/revenuecat-webhook/`), and the RLS policy
   * on `entitlements` grants the owner `select` and nothing else — no insert, no
   * update, no delete, for any client role
   * (`supabase/migrations/0009_entitlements.sql`).
   *
   * Returns null when the account has never had one. A *revoked* entitlement
   * still returns a row, carrying `revokedAt`, because "never bought it" and
   * "bought it and was refunded" are different facts even though they grant the
   * same access — `resolveEntitlementPhase` collapses them, deliberately, at the
   * point where access is decided rather than at the point where it is read.
   */
  getEntitlement(): Promise<EntitlementRecord | null>;
}

// ---------------------------------------------------------------------------
// Demo
// ---------------------------------------------------------------------------

const STORAGE_KEYS = {
  workouts: 'prism.demo.workouts.v1',
  profile: 'prism.demo.profile.v1',
  records: 'prism.demo.records.v1',
  checkIns: 'prism.demo.checkins.v1',
  exercises: 'prism.demo.exercises.v1',
  measurements: 'prism.demo.measurements.v1',
} as const;

/**
 * A measurement the lifter removed.
 *
 * Tombstones rather than mutation of the seed: `generateDemoData()` rebuilds a
 * deterministic year of measurements on every construction, so an entry deleted
 * from the in-memory array would simply return on the next launch. The id is
 * what persists.
 */
interface DemoMeasurementState {
  saved: BodyMeasurement[];
  deletedIds: string[];
}

class DemoRepository implements Repository {
  readonly kind = 'demo' as const;

  private dataset = generateDemoData();
  private hydrated = false;
  /** Workouts logged inside the demo, kept separate from generated history. */
  private userWorkouts: Workout[] = [];
  private userRecords: PersonalRecord[] = [];
  private userCheckIns: CheckIn[] = [];
  private profileOverride: Partial<Profile> = {};
  /** Movements created inside the demo, on top of the bundled library. */
  private userExercises: Exercise[] = [];
  private measurementState: DemoMeasurementState = { saved: [], deletedIds: [] };

  private async hydrate(): Promise<void> {
    if (this.hydrated) return;
    this.hydrated = true;
    try {
      const [w, p, r, c, e, m] = await AsyncStorage.multiGet([
        STORAGE_KEYS.workouts,
        STORAGE_KEYS.profile,
        STORAGE_KEYS.records,
        STORAGE_KEYS.checkIns,
        STORAGE_KEYS.exercises,
        STORAGE_KEYS.measurements,
      ]);
      this.userWorkouts = safeParse<Workout[]>(w[1], []);
      this.profileOverride = safeParse<Partial<Profile>>(p[1], {});
      this.userRecords = safeParse<PersonalRecord[]>(r[1], []);
      this.userExercises = safeParse<Exercise[]>(e[1], []).map((exercise) => ({
        ...exercise,
        // A stored row claiming to be part of the PRism library would make the
        // demo offer edit/delete on something the real backend would refuse.
        isSystem: false,
      }));
      this.measurementState = safeParse<DemoMeasurementState>(m[1], {
        saved: [],
        deletedIds: [],
      });
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
    const next = { ...this.profileOverride, ...patch };
    // Storage first: a failed save must leave both the repository and the
    // training-store read model on the same previous profile.
    await AsyncStorage.setItem(STORAGE_KEYS.profile, JSON.stringify(next));
    this.profileOverride = next;
    return { ...this.dataset.profile, ...next };
  }

  /**
   * The bundled library plus anything the lifter added, by name.
   *
   * Sorted here so it matches `SupabaseRepository.listExercises`'s
   * `.order('name')` -- a custom movement appearing at the end of the list in
   * demo and in the middle of it against a real backend is exactly the kind of
   * divergence demo mode exists to avoid.
   */
  async listExercises(): Promise<Exercise[]> {
    await this.hydrate();
    return [...EXERCISE_LIBRARY, ...this.userExercises].sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }

  async createExercise(input: CustomExerciseInput): Promise<Exercise> {
    await this.hydrate();
    const exercise: Exercise = {
      id: newId('ex'),
      name: input.name,
      equipment: input.equipment,
      primaryMuscles: [...input.primaryMuscles],
      secondaryMuscles: [...input.secondaryMuscles],
      isUnilateral: input.isUnilateral,
      // Never from the caller. In Postgres this is derived from `profile_id`,
      // and a client that could assert it could claim a row was part of the
      // world-readable library.
      isSystem: false,
      cue: input.cue ?? undefined,
    };
    await this.writeExercises([...this.userExercises, exercise]);
    return exercise;
  }

  async updateExercise(id: string, input: CustomExerciseInput): Promise<Exercise> {
    await this.hydrate();
    const existing = this.userExercises.find((e) => e.id === id);
    // Matches what Postgres does: `exercises: update own` makes a PRism library
    // row invisible to an update, so the statement finds nothing to change.
    if (!existing) throw new Error('That movement is not yours to edit.');

    const updated: Exercise = {
      ...existing,
      name: input.name,
      equipment: input.equipment,
      primaryMuscles: [...input.primaryMuscles],
      secondaryMuscles: [...input.secondaryMuscles],
      isUnilateral: input.isUnilateral,
      cue: input.cue ?? undefined,
    };
    await this.writeExercises(this.userExercises.map((e) => (e.id === id ? updated : e)));
    return updated;
  }

  /**
   * Delete a custom movement, refusing when logged sets still reference it.
   *
   * The refusal is the same one Postgres performs at commit time via the
   * deferrable `workout_exercises_exercise_id_fkey`, reproduced here so demo
   * mode rehearses the real failure rather than silently succeeding and leaving
   * sets pointing at a movement that no longer exists.
   */
  async deleteExercise(id: string): Promise<void> {
    await this.hydrate();
    if (!this.userExercises.some((e) => e.id === id)) {
      throw new Error('That movement is not yours to delete.');
    }

    const inUse = (await this.listWorkouts()).some((w) =>
      w.exercises.some((we) => we.exerciseId === id),
    );
    if (inUse) throw new ExerciseInUseError(id);

    await this.writeExercises(this.userExercises.filter((e) => e.id !== id));
  }

  private async writeExercises(next: Exercise[]): Promise<void> {
    // Storage first, then the in-memory array -- the same ordering
    // `completeWorkout` uses, so a rejected write cannot leave the process
    // believing it saved something a relaunch would not find.
    await AsyncStorage.setItem(STORAGE_KEYS.exercises, JSON.stringify(next));
    this.userExercises = next;
  }

  async listRoutines(): Promise<Routine[]> {
    return ROUTINE_TEMPLATES;
  }

  /**
   * The lifter's plan, resolved by the same rule the real backend uses.
   *
   * This used to return `SPECTRUM_FOUR` unconditionally, which happened to be
   * right for the demo profile's four training days and would have stayed
   * wrong for any other answer. `selectActiveRoutine` reads the profile, so
   * changing "sessions per week" in Settings changes the plan in demo exactly
   * as it does against Postgres.
   */
  async getActiveRoutine(): Promise<Routine | null> {
    return selectActiveRoutine(await this.listRoutines(), await this.getProfile());
  }

  /**
   * Demo mode ships only PRism's shared templates, so this always refuses --
   * and refusing is the point. A shared routine row cannot carry one lifter's
   * `is_active` flag, in demo or in Postgres, and both implementations say so
   * the same way rather than one of them quietly succeeding.
   *
   * `[fact]` `ROUTINE_TEMPLATES` is two rows, both `profileId: null`, so the
   * throw is the only reachable outcome here today. No in-memory "chosen
   * routine" is kept, because keeping one would be state that nothing can ever
   * set — the honest version of this method is the one that refuses.
   */
  async setActiveRoutine(routineId: string): Promise<void> {
    const routine = (await this.listRoutines()).find((r) => r.id === routineId);
    if (!routine || routine.profileId == null) throw new RoutineNotSelectableError(routineId);
  }

  async listWorkouts(options?: { limit?: number }): Promise<Workout[]> {
    await this.hydrate();
    const all = [...this.dataset.workouts, ...this.userWorkouts].sort((a, b) =>
      a.startedAt.localeCompare(b.startedAt),
    );
    // Same contract as Postgres: the newest N, still oldest-first. Demo/Supabase
    // parity on this is asserted in `src/data/__tests__/repository.test.ts`,
    // because a bound that behaves differently in the two modes is a bug that
    // only ever appears in production.
    const limit = options?.limit;
    return limit === undefined ? all : all.slice(Math.max(0, all.length - limit));
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

  /**
   * Seeded history, with the lifter's own entries layered over it.
   *
   * Oldest first, matching `SupabaseRepository.listMeasurements`'s
   * `.order('measured_at', { ascending: true })`. Callers that want newest
   * first say so (`measurementsNewestFirst`).
   */
  async listMeasurements(): Promise<BodyMeasurement[]> {
    await this.hydrate();
    const byId = new Map(this.dataset.measurements.map((m) => [m.id, m]));
    for (const m of this.measurementState.saved) byId.set(m.id, m);
    for (const id of this.measurementState.deletedIds) byId.delete(id);
    return [...byId.values()].sort((a, b) => a.measuredAt.localeCompare(b.measuredAt));
  }

  async saveMeasurement(measurement: BodyMeasurement): Promise<void> {
    await this.hydrate();
    const owned = { ...measurement, profileId: DEMO_PROFILE_ID };
    await this.writeMeasurements({
      // Demo has one identity. Stamp it here just as the Supabase repository
      // stamps `auth.uid()`, so a caller-supplied owner is never persisted by
      // either implementation.
      saved: [...this.measurementState.saved.filter((m) => m.id !== owned.id), owned],
      // Re-saving an id that was deleted resurrects it, which is what an
      // "undo" would need and what an upsert does in Postgres.
      deletedIds: this.measurementState.deletedIds.filter((id) => id !== owned.id),
    });
  }

  async deleteMeasurement(id: string): Promise<void> {
    await this.hydrate();
    await this.writeMeasurements({
      saved: this.measurementState.saved.filter((m) => m.id !== id),
      // Tombstoned even when it was only ever a seeded row: `generateDemoData`
      // rebuilds the seed on every construction, so without this the entry
      // returns on the next launch.
      deletedIds: [...new Set([...this.measurementState.deletedIds, id])],
    });
  }

  private async writeMeasurements(next: DemoMeasurementState): Promise<void> {
    await AsyncStorage.setItem(STORAGE_KEYS.measurements, JSON.stringify(next));
    this.measurementState = next;
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
        entitlement: null,
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

  /**
   * Demo mode has no store, no account and nothing to pay for.
   *
   * Null rather than a fabricated grant, and the difference matters. A demo
   * build resolves to `EntitlementPhase.'disabled'` *before* this is ever
   * called (`entitlementStore.initialize`), and `'disabled'` unlocks every
   * surface — so demo mode shows the whole app without anyone having to invent
   * an entitlement record to make that happen. Returning a fake "you own it"
   * row here would be a client-side entitlement by another name, which is
   * exactly what I-9 forbids; this exists so the interface has one meaning in
   * both implementations rather than a method that throws in one of them.
   */
  async getEntitlement(): Promise<EntitlementRecord | null> {
    return null;
  }

  /** Wipe locally logged demo data and return to the pristine seed. */
  async resetDemo(): Promise<void> {
    await AsyncStorage.multiRemove(Object.values(STORAGE_KEYS));
    this.userWorkouts = [];
    this.userRecords = [];
    this.userCheckIns = [];
    this.profileOverride = {};
    this.userExercises = [];
    this.measurementState = { saved: [], deletedIds: [] };
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

  /**
   * The PRism library plus this lifter's own movements.
   *
   * No `uid()` and no `profile_id` filter, deliberately: `exercises: read
   * system or own` already returns exactly the union of the world-readable
   * library and the caller's own rows, and this is one of the three methods
   * documented as scoped by RLS alone (`Docs/invariants.md` I-6).
   */
  async listExercises(): Promise<Exercise[]> {
    const { data, error } = await getSupabase().from('exercises').select('*').order('name');
    if (error) throw error;
    return (data ?? []).map(toExercise);
  }

  /**
   * Insert a movement owned by the signed-in lifter.
   *
   * `profile_id` comes from `uid()` and is the only thing that makes this row
   * theirs rather than part of the library. `exercises: insert own` re-checks
   * it (`with check (profile_id = auth.uid())`), so a forged value is refused
   * by Postgres as well as absent from the mapper.
   */
  async createExercise(input: CustomExerciseInput): Promise<Exercise> {
    const profileId = await this.uid();
    const { data, error } = await getSupabase()
      .from('exercises')
      .insert({ ...fromCustomExercise(input), profile_id: profileId })
      .select()
      .single();
    if (error) throw error;
    return toExercise(data);
  }

  /**
   * Update one of the lifter's own movements.
   *
   * Scoped by owner as well as id, exactly as `deleteWorkout` is: RLS already
   * limits this to their own rows, so the extra `eq` changes no outcome -- it
   * means a policy edit is not the only thing standing between a stray id and
   * someone else's movement.
   *
   * `.select().single()` is not cosmetic. Without it an update matching no row
   * -- a PRism library row, or another account's -- returns success having
   * changed nothing, and the screen would report a save that never happened.
   * With it, no matching row is an error.
   */
  async updateExercise(id: string, input: CustomExerciseInput): Promise<Exercise> {
    const profileId = await this.uid();
    const { data, error } = await getSupabase()
      .from('exercises')
      .update(fromCustomExercise(input))
      .eq('id', id)
      .eq('profile_id', profileId)
      .select()
      .single();
    if (error) throw error;
    return toExercise(data);
  }

  /**
   * Delete one of the lifter's own movements.
   *
   * Two failures, told apart, because they mean opposite things to the person
   * holding the phone:
   *
   *   **In use** -- `23503`, raised at commit by the deferrable
   *   `workout_exercises_exercise_id_fkey` that `0007` chose over `cascade` so
   *   the sets performed with the movement survive. Mapped to
   *   `ExerciseInUseError` so the screen can say which sessions are holding it,
   *   instead of showing a sentence naming two tables and a constraint.
   *
   *   **Not yours** -- no row matched. `.select()` on the delete is what makes
   *   that visible at all: PostgREST reports a delete that removed nothing as a
   *   success, so without it "delete the squat from the PRism library" would
   *   report done and change nothing.
   */
  async deleteExercise(id: string): Promise<void> {
    const profileId = await this.uid();
    const { data, error } = await getSupabase()
      .from('exercises')
      .delete()
      .eq('id', id)
      .eq('profile_id', profileId)
      .select('id');
    if (isForeignKeyViolation(error)) throw new ExerciseInUseError(id, error);
    if (error) throw error;
    if ((data ?? []).length === 0) throw new Error('That movement is not yours to delete.');
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

  /**
   * The lifter's plan.
   *
   * Was `routines.find(r => !r.isTemplate) ?? routines[0]`, which never found
   * anything: `0006_seed_library.sql` seeds both plans with `is_template =
   * true`, so every account fell through to `routines[0]` -- "Prism 3", because
   * `.order('name')` puts P before S. `selectActiveRoutine` states the order
   * instead of leaving it to alphabetisation, and reads the profile, which is
   * where a template choice is actually recorded.
   */
  async getActiveRoutine(): Promise<Routine | null> {
    const [routines, profile] = await Promise.all([this.listRoutines(), this.getProfile()]);
    return selectActiveRoutine(routines, profile);
  }

  /**
   * Mark a routine the lifter owns as their active plan.
   *
   * Ownership is checked with a read **before** anything is written, so the
   * common failure -- asking for a shared PRism template -- costs nothing and
   * leaves the lifter's existing plan alone. Doing it the other way round
   * (clear, then try to set, then discover it was not theirs) would leave them
   * with no active plan at all.
   *
   * The clear is a separate statement from the set, and has to be:
   * `routines_one_active_per_profile` is a partial unique index on
   * `(profile_id) where is_active`, so setting a second active row before
   * clearing the first violates it. If the process dies between the two, no
   * routine is active and `selectActiveRoutine` falls back to the profile --
   * degraded, visible, and fixed by repeating the call. There is no
   * multi-statement transaction available here without a migration
   * (`Docs/invariants.md` I-2's "safely recoverable" limb).
   */
  async setActiveRoutine(routineId: string): Promise<void> {
    const profileId = await this.uid();
    const client = getSupabase();

    const { data: owned, error: readError } = await client
      .from('routines')
      .select('id')
      .eq('id', routineId)
      .eq('profile_id', profileId)
      .maybeSingle();
    if (readError) throw readError;
    if (!owned) throw new RoutineNotSelectableError(routineId);

    const { error: clearError } = await client
      .from('routines')
      .update({ is_active: false })
      .eq('profile_id', profileId)
      .eq('is_active', true);
    if (clearError) throw clearError;

    const { error: setError } = await client
      .from('routines')
      .update({ is_active: true })
      .eq('id', routineId)
      .eq('profile_id', profileId);
    if (setError) throw setError;
  }

  async listWorkouts(options?: { limit?: number }): Promise<Workout[]> {
    const id = await this.uid();
    const limit = options?.limit;

    /*
      The limit has to be applied to the NEWEST rows, and the method's contract
      is oldest-first — so a bounded read cannot simply add `.limit()` to the
      ascending query. That would return the oldest N sessions and quietly show
      a returning lifter their first month of training as though it were their
      last.

      So the sort is inverted for the bounded read and the window is reversed
      back afterwards. `workouts_profile_started_idx` is
      `(profile_id, started_at desc)`, so descending is the index's own
      direction and this is the cheaper scan of the two.
    */
    const query = getSupabase()
      .from('workouts')
      .select(WORKOUT_SELECT)
      .eq('profile_id', id)
      .order('started_at', { ascending: limit === undefined });

    const { data, error } = limit === undefined ? await query : await query.limit(limit);
    if (error) throw error;

    const rows = (data ?? []).map(toWorkout);
    return limit === undefined ? rows : rows.reverse();
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

  /**
   * Upsert one measurement.
   *
   * An upsert rather than an insert so that re-submitting the same record after
   * a lost response updates it instead of failing on the primary key -- the id
   * is minted on the device, so a retry carries the same one and must be a
   * no-op rather than a duplicate or an error.
   *
   * `profile_id` is stamped from the session; `fromMeasurement` does not carry
   * one, so a `BodyMeasurement` naming another account cannot smuggle it in.
   */
  async saveMeasurement(measurement: BodyMeasurement): Promise<void> {
    const profileId = await this.uid();
    const { error } = await getSupabase()
      .from('body_measurements')
      .upsert({ ...fromMeasurement(measurement), profile_id: profileId });
    if (error) throw error;
  }

  /** Scoped by owner as well as id, for the same reason `deleteWorkout` is. */
  async deleteMeasurement(id: string): Promise<void> {
    const profileId = await this.uid();
    const { error } = await getSupabase()
      .from('body_measurements')
      .delete()
      .eq('id', id)
      .eq('profile_id', profileId);
    if (error) throw error;
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
    const [profile, exercises, workouts, checkIns, measurements, personalRecords, entitlement] =
      await Promise.all([
        this.getProfile(),
        this.listExercises(),
        this.listWorkouts(),
        this.listCheckIns(),
        this.listMeasurements(),
        this.listPersonalRecords(),
        this.getEntitlement(),
      ]);

    return buildAccountExport(
      { profile, exercises, workouts, checkIns, measurements, personalRecords, entitlement },
      new Date().toISOString(),
    );
  }

  /**
   * Delete the account and its purchase-processor customer record.
   *
   * The authenticated `delete-account` Edge Function deletes the same verified
   * UUID from RevenueCat first, then invokes the existing no-argument
   * `delete_my_account` RPC under this user's JWT. No id is sent by the client.
   * If processor erasure fails, database deletion does not begin and the UI
   * cannot make the false claim that all account data is gone.
   *
   * `uid()` first so an unauthenticated call fails with `AuthRequiredError`
   * rather than a function error, matching every other write here.
   */
  async deleteAccount(): Promise<void> {
    await this.uid();
    const { error } = await getSupabase().functions.invoke('delete-account', { body: {} });
    if (error) throw error;
  }

  /**
   * The entitlement row, straight out of Postgres (I-9).
   *
   * This is the whole of the client's involvement in deciding who has paid: one
   * select, against a table whose only client-facing policy is
   * `"entitlements: read own"` — select, owner-scoped, and no insert, update or
   * delete policy exists for `authenticated` or `anon` at all. A modified client
   * can read this row; it has no statement available to it that could write one.
   *
   * Scoped by `profile_id` as well as by RLS, matching `deleteWorkout`'s posture:
   * RLS already limits the read to this account's rows, so this changes no
   * outcome — it means a bug in one layer is not the only thing standing between
   * a query and someone else's purchase.
   *
   * `maybeSingle()` because "no row" is the ordinary case for most accounts and
   * must not read as an error. The primary key on `(profile_id, entitlement_id)`
   * makes the explicit `pro` predicate singular.
   */
  async getEntitlement(): Promise<EntitlementRecord | null> {
    const profileId = await this.uid();
    const { data, error } = await getSupabase()
      .from('entitlements')
      .select('entitlement_id, product_id, granted_at, revoked_at, source')
      .eq('profile_id', profileId)
      .eq('entitlement_id', PRO_ENTITLEMENT_ID)
      .maybeSingle();
    if (error) throw error;
    return data ? toEntitlement(data) : null;
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Entitlement row -> domain record.
 *
 * Deliberately keeps `revoked_at` rather than collapsing it to a boolean here.
 * A mapper that returned `{ entitled: true }` would be the client-controlled
 * boolean I-9 is about — the shape would invite someone to construct one.
 */
function toEntitlement(row: any): EntitlementRecord {
  return {
    entitlementId: row.entitlement_id,
    productId: row.product_id,
    grantedAt: row.granted_at,
    revokedAt: row.revoked_at ?? null,
    source: row.source,
  };
}

function toRoutine(row: any): Routine {
  return {
    id: row.id,
    profileId: row.profile_id ?? null,
    name: row.name,
    description: row.description ?? '',
    daysPerWeek: row.days_per_week,
    isTemplate: row.is_template,
    // `is_active` has been in the select list since the column existed and was
    // dropped on the floor here, which is why `getActiveRoutine` had nothing to
    // read and fell back to alphabetical order.
    isActive: row.is_active === true,
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
