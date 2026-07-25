-- ===========================================================================
-- PRism -- initial schema
-- ===========================================================================
-- Design rules:
--   * Every user-owned row carries `profile_id` so RLS is a single-column check.
--   * Weights are ALWAYS stored in kilograms. `profiles.unit` is a display
--     preference only; conversion happens in the client. This keeps every
--     aggregate (volume, e1RM, PRs) unit-agnostic and comparable forever.
--   * Deleting a profile cascades to all of that user's training data, which is
--     what makes the "delete my data" control in Settings a one-liner.
--   * The system exercise library is readable by everyone and writable by no
--     one; user-created exercises live in the same table with `profile_id` set.
-- ===========================================================================

create extension if not exists "pgcrypto";

-- --------------------------------------------------------------------------
-- Enums
-- --------------------------------------------------------------------------

create type muscle_group as enum (
  'chest','front_delts','side_delts','rear_delts','lats','upper_back','traps',
  'lower_back','biceps','triceps','forearms','core','glutes','quads',
  'hamstrings','calves'
);

create type equipment_type as enum (
  'barbell','dumbbell','machine','cable','bodyweight','kettlebell','band','smith'
);

create type unit_type       as enum ('kg','lb');
create type goal_type       as enum ('strength','hypertrophy','general_fitness','fat_loss');
create type experience_type as enum ('beginner','intermediate','advanced');
create type set_type        as enum ('working','warmup','dropset','failure','backoff');
create type pr_kind         as enum ('e1rm','weight','volume','reps');
create type workout_status  as enum ('in_progress','completed','abandoned');

-- --------------------------------------------------------------------------
-- profiles
-- --------------------------------------------------------------------------

create table profiles (
  id                      uuid primary key references auth.users (id) on delete cascade,
  display_name            text        not null default 'Lifter',
  goal                    goal_type   not null default 'hypertrophy',
  experience              experience_type not null default 'intermediate',
  training_days_per_week  smallint    not null default 4
                            check (training_days_per_week between 1 and 7),
  -- ISO weekday numbers, 1 = Monday
  preferred_weekdays      smallint[]  not null default '{1,2,4,5}',
  available_equipment     equipment_type[] not null default '{barbell,dumbbell,machine,cable,bodyweight}',
  unit                    unit_type   not null default 'kg',
  bodyweight_kg           numeric(6,2),
  onboarded_at            timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

-- --------------------------------------------------------------------------
-- exercises  (profile_id null = PRism system library, visible to everyone)
-- --------------------------------------------------------------------------

create table exercises (
  id                uuid primary key default gen_random_uuid(),
  profile_id        uuid references profiles (id) on delete cascade,
  name              text not null,
  equipment         equipment_type not null,
  primary_muscles   muscle_group[] not null check (array_length(primary_muscles, 1) >= 1),
  secondary_muscles muscle_group[] not null default '{}',
  is_unilateral     boolean not null default false,
  cue               text,
  created_at        timestamptz not null default now()
);

create unique index exercises_system_name_key
  on exercises (lower(name), equipment) where profile_id is null;
create index exercises_profile_idx on exercises (profile_id);
create index exercises_primary_muscles_idx on exercises using gin (primary_muscles);

-- --------------------------------------------------------------------------
-- routines / routine_days / routine_exercises
-- (profile_id null = PRism template plan, clonable by any user)
-- --------------------------------------------------------------------------

create table routines (
  id            uuid primary key default gen_random_uuid(),
  profile_id    uuid references profiles (id) on delete cascade,
  name          text not null,
  description   text not null default '',
  days_per_week smallint not null default 4 check (days_per_week between 1 and 7),
  is_template   boolean not null default false,
  is_active     boolean not null default false,
  created_at    timestamptz not null default now()
);

create index routines_profile_idx on routines (profile_id);
-- At most one active routine per lifter.
create unique index routines_one_active_per_profile
  on routines (profile_id) where is_active;

create table routine_days (
  id         uuid primary key default gen_random_uuid(),
  routine_id uuid not null references routines (id) on delete cascade,
  name       text not null,
  day_index  smallint not null,
  weekday    smallint check (weekday between 1 and 7),
  unique (routine_id, day_index)
);

create table routine_exercises (
  id              uuid primary key default gen_random_uuid(),
  routine_day_id  uuid not null references routine_days (id) on delete cascade,
  exercise_id     uuid not null references exercises (id) on delete restrict,
  order_index     smallint not null,
  target_sets     smallint not null default 3 check (target_sets between 1 and 20),
  target_reps_low smallint not null default 8,
  target_reps_high smallint not null default 12,
  target_rpe      numeric(3,1) check (target_rpe between 5 and 10),
  rest_seconds    smallint not null default 120,
  check (target_reps_high >= target_reps_low),
  unique (routine_day_id, order_index)
);

-- --------------------------------------------------------------------------
-- workouts / workout_exercises / sets
-- --------------------------------------------------------------------------

create table workouts (
  id             uuid primary key default gen_random_uuid(),
  profile_id     uuid not null references profiles (id) on delete cascade,
  routine_day_id uuid references routine_days (id) on delete set null,
  title          text not null default 'Workout',
  status         workout_status not null default 'in_progress',
  started_at     timestamptz not null default now(),
  ended_at       timestamptz,
  reflection     text,
  session_rating smallint check (session_rating between 1 and 5),
  created_at     timestamptz not null default now(),
  check (ended_at is null or ended_at >= started_at)
);

create index workouts_profile_started_idx on workouts (profile_id, started_at desc);
create index workouts_status_idx on workouts (profile_id, status);

create table workout_exercises (
  id          uuid primary key default gen_random_uuid(),
  workout_id  uuid not null references workouts (id) on delete cascade,
  exercise_id uuid not null references exercises (id) on delete restrict,
  order_index smallint not null,
  notes       text,
  unique (workout_id, order_index)
);

create index workout_exercises_workout_idx on workout_exercises (workout_id);
create index workout_exercises_exercise_idx on workout_exercises (exercise_id);

create table sets (
  id                  uuid primary key default gen_random_uuid(),
  workout_exercise_id uuid not null references workout_exercises (id) on delete cascade,
  set_index           smallint not null,
  type                set_type not null default 'working',
  -- Always kilograms. 0 is legal (bodyweight movements).
  weight_kg           numeric(7,2) not null default 0 check (weight_kg >= 0),
  reps                smallint not null default 0 check (reps >= 0 and reps <= 500),
  -- Half-point RPE, 5.0 - 10.0
  rpe                 numeric(3,1) check (rpe >= 5 and rpe <= 10),
  completed           boolean not null default false,
  rest_seconds        smallint check (rest_seconds >= 0),
  notes               text,
  logged_at           timestamptz not null default now(),
  unique (workout_exercise_id, set_index)
);

create index sets_workout_exercise_idx on sets (workout_exercise_id);

-- --------------------------------------------------------------------------
-- body_measurements / check_ins
-- --------------------------------------------------------------------------

create table body_measurements (
  id               uuid primary key default gen_random_uuid(),
  profile_id       uuid not null references profiles (id) on delete cascade,
  measured_at      timestamptz not null default now(),
  bodyweight_kg    numeric(6,2) check (bodyweight_kg > 0),
  body_fat_pct     numeric(4,1) check (body_fat_pct between 1 and 70),
  -- { "waist": 82.0, "chest": 104.5 } in centimetres
  circumferences_cm jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now()
);

create index body_measurements_profile_idx
  on body_measurements (profile_id, measured_at desc);

create table check_ins (
  id             uuid primary key default gen_random_uuid(),
  profile_id     uuid not null references profiles (id) on delete cascade,
  checked_in_at  timestamptz not null default now(),
  sleep_quality  smallint not null check (sleep_quality between 1 and 5),
  energy         smallint not null check (energy between 1 and 5),
  soreness       smallint not null check (soreness between 1 and 5),
  stress         smallint not null check (stress between 1 and 5),
  note           text,
  created_at     timestamptz not null default now()
);

create index check_ins_profile_idx on check_ins (profile_id, checked_in_at desc);
-- One check-in per calendar day per lifter.
create unique index check_ins_one_per_day
  on check_ins (profile_id, (checked_in_at::date));

-- --------------------------------------------------------------------------
-- personal_records
-- --------------------------------------------------------------------------

create table personal_records (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references profiles (id) on delete cascade,
  exercise_id uuid not null references exercises (id) on delete cascade,
  kind        pr_kind not null,
  -- e1rm/weight -> kilograms; volume -> kilograms; reps -> count
  value       numeric(9,2) not null check (value > 0),
  reps        smallint,
  weight_kg   numeric(7,2),
  achieved_at timestamptz not null default now(),
  workout_id  uuid references workouts (id) on delete set null,
  created_at  timestamptz not null default now()
);

create index personal_records_lookup_idx
  on personal_records (profile_id, exercise_id, kind, value desc);

-- --------------------------------------------------------------------------
-- updated_at trigger
-- --------------------------------------------------------------------------

create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on profiles
  for each row execute function set_updated_at();

-- --------------------------------------------------------------------------
-- Auto-create a profile row when a user signs up
-- --------------------------------------------------------------------------

create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', 'Lifter'))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ===========================================================================
-- ROW LEVEL SECURITY
-- ===========================================================================
-- Model: a row is yours if you can trace it to your profile_id.
-- Child tables (workout_exercises, sets, routine_days, routine_exercises) have
-- no profile_id of their own, so they are guarded by an EXISTS walk up to the
-- owning parent. The indexes above make those walks index-only.
-- ===========================================================================

alter table profiles          enable row level security;
alter table exercises         enable row level security;
alter table routines          enable row level security;
alter table routine_days      enable row level security;
alter table routine_exercises enable row level security;
alter table workouts          enable row level security;
alter table workout_exercises enable row level security;
alter table sets              enable row level security;
alter table body_measurements enable row level security;
alter table check_ins         enable row level security;
alter table personal_records  enable row level security;

-- profiles ------------------------------------------------------------------
create policy "profiles: read own"
  on profiles for select using (auth.uid() = id);
create policy "profiles: update own"
  on profiles for update using (auth.uid() = id) with check (auth.uid() = id);
create policy "profiles: insert own"
  on profiles for insert with check (auth.uid() = id);
create policy "profiles: delete own"
  on profiles for delete using (auth.uid() = id);

-- exercises -----------------------------------------------------------------
-- System library (profile_id is null) is world-readable and immutable.
create policy "exercises: read system or own"
  on exercises for select using (profile_id is null or profile_id = auth.uid());
create policy "exercises: insert own"
  on exercises for insert with check (profile_id = auth.uid());
create policy "exercises: update own"
  on exercises for update using (profile_id = auth.uid()) with check (profile_id = auth.uid());
create policy "exercises: delete own"
  on exercises for delete using (profile_id = auth.uid());

-- routines ------------------------------------------------------------------
create policy "routines: read templates or own"
  on routines for select using (profile_id is null or profile_id = auth.uid());
create policy "routines: write own"
  on routines for all using (profile_id = auth.uid()) with check (profile_id = auth.uid());

create policy "routine_days: read via routine"
  on routine_days for select using (
    exists (
      select 1 from routines r
      where r.id = routine_days.routine_id
        and (r.profile_id is null or r.profile_id = auth.uid())
    )
  );
create policy "routine_days: write via own routine"
  on routine_days for all using (
    exists (select 1 from routines r where r.id = routine_days.routine_id and r.profile_id = auth.uid())
  ) with check (
    exists (select 1 from routines r where r.id = routine_days.routine_id and r.profile_id = auth.uid())
  );

create policy "routine_exercises: read via day"
  on routine_exercises for select using (
    exists (
      select 1 from routine_days d
      join routines r on r.id = d.routine_id
      where d.id = routine_exercises.routine_day_id
        and (r.profile_id is null or r.profile_id = auth.uid())
    )
  );
create policy "routine_exercises: write via own day"
  on routine_exercises for all using (
    exists (
      select 1 from routine_days d
      join routines r on r.id = d.routine_id
      where d.id = routine_exercises.routine_day_id and r.profile_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from routine_days d
      join routines r on r.id = d.routine_id
      where d.id = routine_exercises.routine_day_id and r.profile_id = auth.uid()
    )
  );

-- workouts ------------------------------------------------------------------
create policy "workouts: own"
  on workouts for all using (profile_id = auth.uid()) with check (profile_id = auth.uid());

create policy "workout_exercises: via own workout"
  on workout_exercises for all using (
    exists (select 1 from workouts w where w.id = workout_exercises.workout_id and w.profile_id = auth.uid())
  ) with check (
    exists (select 1 from workouts w where w.id = workout_exercises.workout_id and w.profile_id = auth.uid())
  );

create policy "sets: via own workout"
  on sets for all using (
    exists (
      select 1 from workout_exercises we
      join workouts w on w.id = we.workout_id
      where we.id = sets.workout_exercise_id and w.profile_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from workout_exercises we
      join workouts w on w.id = we.workout_id
      where we.id = sets.workout_exercise_id and w.profile_id = auth.uid()
    )
  );

-- measurements / check-ins / records ----------------------------------------
create policy "body_measurements: own"
  on body_measurements for all using (profile_id = auth.uid()) with check (profile_id = auth.uid());

create policy "check_ins: own"
  on check_ins for all using (profile_id = auth.uid()) with check (profile_id = auth.uid());

create policy "personal_records: own"
  on personal_records for all using (profile_id = auth.uid()) with check (profile_id = auth.uid());
