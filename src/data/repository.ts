import AsyncStorage from '@react-native-async-storage/async-storage';
import { EXERCISE_LIBRARY } from './exerciseLibrary';
import { ROUTINE_TEMPLATES, SPECTRUM_FOUR } from './routineTemplates';
import { generateDemoData, DEMO_PROFILE_ID } from './demoSeed';
import { DEMO_MODE, getSupabase, isSupabaseConfigured } from './supabase/client';
import {
  fromProfile,
  fromSet,
  fromWorkout,
  fromWorkoutExercise,
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
  deleteWorkout(id: string): Promise<void>;
  listCheckIns(): Promise<CheckIn[]>;
  saveCheckIn(checkIn: CheckIn): Promise<void>;
  listMeasurements(): Promise<BodyMeasurement[]>;
  listPersonalRecords(): Promise<PersonalRecord[]>;
  savePersonalRecords(records: PersonalRecord[]): Promise<void>;
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
      this.userCheckIns = safeParse<CheckIn[]>(c[1], []);
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

  async saveCheckIn(checkIn: CheckIn): Promise<void> {
    await this.hydrate();
    this.userCheckIns = [...this.userCheckIns.filter((c) => c.id !== checkIn.id), checkIn];
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

  private async uid(): Promise<string> {
    const { data, error } = await getSupabase().auth.getUser();
    if (error || !data.user) throw new Error('Not signed in.');
    return data.user.id;
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
   * Persist a workout and its whole object graph. Upserts rather than diffing:
   * a training session is small (tens of rows) and idempotency beats cleverness
   * when the user is mid-set on flaky gym wifi.
   */
  async saveWorkout(workout: Workout): Promise<void> {
    const db = getSupabase();
    const { error: wErr } = await db.from('workouts').upsert(fromWorkout(workout));
    if (wErr) throw wErr;

    if (workout.exercises.length > 0) {
      const { error: weErr } = await db
        .from('workout_exercises')
        .upsert(workout.exercises.map(fromWorkoutExercise));
      if (weErr) throw weErr;

      const sets = workout.exercises.flatMap((we) => we.sets.map(fromSet));
      if (sets.length > 0) {
        const { error: sErr } = await db.from('sets').upsert(sets);
        if (sErr) throw sErr;
      }
    }
  }

  async deleteWorkout(id: string): Promise<void> {
    const { error } = await getSupabase().from('workouts').delete().eq('id', id);
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

  async saveCheckIn(checkIn: CheckIn): Promise<void> {
    const { error } = await getSupabase().from('check_ins').upsert({
      id: checkIn.id,
      profile_id: checkIn.profileId,
      checked_in_at: checkIn.checkedInAt,
      sleep_quality: checkIn.sleepQuality,
      energy: checkIn.energy,
      soreness: checkIn.soreness,
      stress: checkIn.stress,
      note: checkIn.note,
    });
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
    const { error } = await getSupabase().from('personal_records').insert(
      records.map((r) => ({
        id: r.id,
        profile_id: r.profileId,
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
// Singleton
// ---------------------------------------------------------------------------

let instance: Repository | null = null;

export function getRepository(): Repository {
  if (!instance) {
    instance = isSupabaseConfigured ? new SupabaseRepository() : new DemoRepository();
  }
  return instance;
}

export function isDemoMode(): boolean {
  return getRepository().kind === 'demo';
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
