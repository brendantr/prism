-- ---------------------------------------------------------------------------
-- 0006_seed_library.sql — PRism's shared movement catalogue and template plans
-- ---------------------------------------------------------------------------
--
-- WHY THIS MIGRATION EXISTS
-- -------------------------
-- Until this file, a correctly migrated PRism project contained no exercises
-- and no routines, and nothing in the repository put any there. `README.md`
-- step 3 told the operator to paste the library in by hand. The consequence was
-- not subtle: a real lifter signing in got an empty exercise picker, no plans,
-- and a logger with nothing to log against — the app was unusable in exactly
-- the mode it is meant to ship in. It was invisible to every existing test,
-- because the SQL suites seed their own exercises and the Jest suites run the
-- demo repository, which reads the catalogue out of the bundle.
--
-- WHAT THIS IS, AND WHAT IT IS NOT
-- --------------------------------
-- This is **app content**, not user data. It seeds the dictionary a lifter logs
-- against — names, equipment, and the muscle mapping that volume, muscle
-- distribution and readiness are computed from — in the same sense that
-- `muscle_group` is an enum rather than something each account invents.
--
-- It seeds **no training history of any kind**: no workouts, no sets, no
-- check-ins, no personal records, no measurements. Every account created
-- against a project with this migration applied starts empty and stays empty
-- until its owner logs something. The 8-week demo history in
-- `src/data/demoSeed.ts` is a separate thing entirely, lives only in the
-- client bundle, and never reaches Postgres.
--
-- OWNERSHIP AND VISIBILITY
-- ------------------------
-- Every row here has `profile_id = null`, which `0001_init.sql` already defines
-- as "PRism's own, world-readable, not writable by anyone" — see the
-- `exercises: read system or own` and `routines: read templates or own`
-- policies. So this migration grants no new access and creates no new
-- authorization surface; it populates a category the schema was built with.
-- `Docs/invariants.md` I-6's documented exception is exactly these rows.
--
-- A lifter's own movements are unaffected: `exercises` rows carrying their
-- `profile_id` remain theirs to create, edit and delete.
--
-- IDEMPOTENCY
-- -----------
-- Re-running this file is a no-op, which matters because applying migrations to
-- a hosted project is a manual step and "did that one already run?" is a
-- question the operator should not have to answer from memory.
--   * Exercises conflict on `exercises_system_name_key`, the partial unique
--     index over `(lower(name), equipment) where profile_id is null` that
--     `0001` already created. Name plus equipment is the natural key: a barbell
--     bench press and a dumbbell bench press are different movements.
--   * Routines are guarded by an existence check on name, because `routines`
--     has no natural-key index and adding one would be a schema change beyond
--     seeding.
--
-- IDS ARE NOT PINNED, DELIBERATELY
-- --------------------------------
-- Rows take `gen_random_uuid()`, so two projects seeded from this file hold
-- different ids for the same movement. Nothing depends on them agreeing: no id
-- here is referenced from application code, and the app reads the catalogue
-- from `listExercises()` at runtime. Pinning 43 literal uuids would buy nothing
-- and would make this file unreadable. The one place the repository still names
-- a movement by a hard-coded id is `trainingStore`'s default
-- `favouriteExerciseIds`, which uses the client library's `ex_*` slugs; those
-- match nothing here, so a real account simply starts with no favourites. That
-- is cosmetic, is recorded in the sprint record, and is not fixed here.
--
-- DRIFT
-- -----
-- `src/data/__tests__/librarySeed.test.ts` asserts this file and
-- `src/data/exerciseLibrary.ts` describe the same catalogue, so demo mode and a
-- real backend cannot quietly diverge on what a movement is called or which
-- muscles it trains. `supabase/tests/rls/06_run_library_seed_tests.sql` asserts
-- the behaviour: seeded, visible to a lifter who owns none of it, immutable to
-- them, idempotent on a second application.
--
-- Source of the content below: `src/data/exerciseLibrary.ts` and
-- `src/data/routineTemplates.ts`, both original to this project.
-- Sprint record: `Docs/sprints/2026-08-07-library-seed.md`.
-- ---------------------------------------------------------------------------

do $$
declare
  v_routine uuid;
  v_day     uuid;
  v_slots   integer;
  v_system  integer;
begin
-- exercises: 43 system rows
  insert into public.exercises
    (profile_id, name, equipment, primary_muscles, secondary_muscles, is_unilateral, cue)
  values
    (null, 'Barbell Bench Press', 'barbell', '{chest}', '{triceps,front_delts}', false, 'Ribs down, bar to the low chest, drive the floor away.'),
    (null, 'Incline Barbell Press', 'barbell', '{chest,front_delts}', '{triceps}', false, 'Thirty degrees is plenty — higher turns it into a shoulder press.'),
    (null, 'Dumbbell Bench Press', 'dumbbell', '{chest}', '{triceps,front_delts}', false, 'Let the elbows travel past the torso, then squeeze the bells together.'),
    (null, 'Incline Dumbbell Press', 'dumbbell', '{chest,front_delts}', '{triceps}', false, 'Stop the descent when the stretch turns into shoulder strain.'),
    (null, 'Machine Chest Press', 'machine', '{chest}', '{triceps,front_delts}', false, 'Set the handles at nipple height and hold the last inch.'),
    (null, 'Cable Chest Fly', 'cable', '{chest}', '{front_delts}', false, 'Soft elbows, long arc, finish with the wrists crossing.'),
    (null, 'Weighted Dip', 'bodyweight', '{chest,triceps}', '{front_delts}', false, 'Lean forward for chest, stay upright for triceps. Pick one.'),
    (null, 'Standing Overhead Press', 'barbell', '{front_delts}', '{triceps,core,side_delts}', false, 'Squeeze the glutes, move the head back, punch the ceiling.'),
    (null, 'Dumbbell Shoulder Press', 'dumbbell', '{front_delts}', '{triceps,side_delts}', false, 'Seated with a back pad — save the standing version for the barbell.'),
    (null, 'Dumbbell Lateral Raise', 'dumbbell', '{side_delts}', '{traps}', false, 'Lead with the elbow. If it swings, the weight is winning.'),
    (null, 'Cable Lateral Raise', 'cable', '{side_delts}', '{}', true, 'Cable behind the body keeps tension through the bottom half.'),
    (null, 'Weighted Pull-Up', 'bodyweight', '{lats}', '{biceps,upper_back,forearms}', false, 'Start from a dead hang. Chest to the bar, not chin over it.'),
    (null, 'Lat Pulldown', 'machine', '{lats}', '{biceps,upper_back}', false, 'Pull the elbows into your back pockets, not the bar to your chin.'),
    (null, 'Neutral-Grip Pulldown', 'cable', '{lats}', '{biceps,upper_back}', false, 'Neutral grip lets you go heavier without the elbow complaint.'),
    (null, 'Barbell Row', 'barbell', '{upper_back,lats}', '{biceps,rear_delts,lower_back}', false, 'Hinge to forty-five degrees and hold it. The torso does not rise with the bar.'),
    (null, 'Single-Arm Dumbbell Row', 'dumbbell', '{lats,upper_back}', '{biceps,rear_delts}', true, 'Row to the hip, not the armpit. Full stretch at the bottom.'),
    (null, 'Chest-Supported Row', 'machine', '{upper_back}', '{lats,biceps,rear_delts}', false, 'The pad removes the lower back from the equation — use that.'),
    (null, 'Seated Cable Row', 'cable', '{upper_back,lats}', '{biceps,rear_delts}', false, 'Let the shoulder blades travel forward, then pull them back together.'),
    (null, 'Cable Face Pull', 'cable', '{rear_delts}', '{upper_back,traps}', false, 'High anchor, pull to the forehead, rotate the knuckles skyward.'),
    (null, 'Back Squat', 'barbell', '{quads,glutes}', '{core,hamstrings,lower_back}', false, 'Brace before you unrack. Break at hips and knees together.'),
    (null, 'Front Squat', 'barbell', '{quads}', '{core,glutes,upper_back}', false, 'Elbows high. The moment they drop, the bar follows.'),
    (null, 'Hack Squat', 'machine', '{quads}', '{glutes}', false, 'Feet low on the platform loads the quads hardest.'),
    (null, 'Leg Press', 'machine', '{quads,glutes}', '{hamstrings}', false, 'Stop before the lower back peels off the pad.'),
    (null, 'Bulgarian Split Squat', 'dumbbell', '{quads,glutes}', '{hamstrings,core}', true, 'Front shin vertical for glutes, knee travelling forward for quads.'),
    (null, 'Leg Extension', 'machine', '{quads}', '{}', false, 'Pause at the top for a full second. That second is the whole exercise.'),
    (null, 'Conventional Deadlift', 'barbell', '{glutes,hamstrings,lower_back}', '{upper_back,traps,forearms}', false, 'Pull the slack out of the bar before anything moves.'),
    (null, 'Romanian Deadlift', 'barbell', '{hamstrings,glutes}', '{lower_back,forearms}', false, 'Push the hips back until the hamstrings tell you to stop. Then stand.'),
    (null, 'Dumbbell Romanian Deadlift', 'dumbbell', '{hamstrings,glutes}', '{lower_back}', false, 'Bells stay in contact with the thighs the entire way down.'),
    (null, 'Barbell Hip Thrust', 'barbell', '{glutes}', '{hamstrings,core}', false, 'Chin tucked, ribs down, one-second squeeze at lockout.'),
    (null, 'Seated Leg Curl', 'machine', '{hamstrings}', '{calves}', false, 'Seated beats lying — the hip flexion adds stretch under load.'),
    (null, 'Barbell Curl', 'barbell', '{biceps}', '{forearms}', false, 'Elbows pinned to the ribs. If they drift forward, the set is over.'),
    (null, 'Incline Dumbbell Curl', 'dumbbell', '{biceps}', '{forearms}', false, 'The behind-the-body position is the point. Do not shorten it.'),
    (null, 'Hammer Curl', 'dumbbell', '{biceps,forearms}', '{}', false, 'Neutral grip biases the brachialis — thickness, not peak.'),
    (null, 'Cable Curl', 'cable', '{biceps}', '{forearms}', false, 'Constant tension top to bottom. Slow the eccentric down.'),
    (null, 'EZ-Bar Skullcrusher', 'barbell', '{triceps}', '{}', false, 'Lower behind the head, not to the forehead. Elbows stay stacked.'),
    (null, 'Cable Tricep Pushdown', 'cable', '{triceps}', '{}', false, 'Lock the elbows at your sides and let only the forearms move.'),
    (null, 'Overhead Cable Extension', 'cable', '{triceps}', '{}', false, 'Overhead loads the long head at full stretch. Do not rush the bottom.'),
    (null, 'Standing Calf Raise', 'machine', '{calves}', '{}', false, 'Full sink at the bottom, two-second hold at the top.'),
    (null, 'Seated Calf Raise', 'machine', '{calves}', '{}', false, 'Bent knee shifts the work to the soleus. Go slow, go heavy.'),
    (null, 'Hanging Leg Raise', 'bodyweight', '{core}', '{forearms}', false, 'Curl the pelvis up. Swinging legs are just a grip exercise.'),
    (null, 'Cable Crunch', 'cable', '{core}', '{}', false, 'Round the spine down toward the hips — this is not a hip flexor drill.'),
    (null, 'Back Extension', 'bodyweight', '{lower_back,glutes}', '{hamstrings}', false, 'Stop at a straight line. Hyperextending buys you nothing.'),
    (null, 'Dumbbell Shrug', 'dumbbell', '{traps}', '{forearms}', false, 'Straight up, brief hold, no rolling.')
  on conflict (lower(name), equipment) where profile_id is null do nothing;

  -- Spectrum 4
  if not exists (select 1 from public.routines where profile_id is null and name = 'Spectrum 4') then
    insert into public.routines (profile_id, name, description, days_per_week, is_template, is_active)
    values (null, 'Spectrum 4', 'Four days, upper/lower, split by movement pattern so no muscle sees two hard sessions inside 48 hours. Built for lifters who want steady load progression without living in the gym.', 4, true, false)
    returning id into v_routine;

    insert into public.routine_days (routine_id, name, day_index, weekday)
    values (v_routine, 'Lower — Squat', 0, 1)
    returning id into v_day;
    insert into public.routine_exercises
      (routine_day_id, exercise_id, order_index, target_sets, target_reps_low, target_reps_high, target_rpe, rest_seconds)
    select v_day, e.id, 0, 4, 5, 8, 8, 180
      from public.exercises e
     where e.profile_id is null and lower(e.name) = lower('Back Squat') and e.equipment = 'barbell';
    insert into public.routine_exercises
      (routine_day_id, exercise_id, order_index, target_sets, target_reps_low, target_reps_high, target_rpe, rest_seconds)
    select v_day, e.id, 1, 3, 8, 10, 8, 150
      from public.exercises e
     where e.profile_id is null and lower(e.name) = lower('Romanian Deadlift') and e.equipment = 'barbell';
    insert into public.routine_exercises
      (routine_day_id, exercise_id, order_index, target_sets, target_reps_low, target_reps_high, target_rpe, rest_seconds)
    select v_day, e.id, 2, 3, 10, 12, 8.5, 120
      from public.exercises e
     where e.profile_id is null and lower(e.name) = lower('Leg Press') and e.equipment = 'machine';
    insert into public.routine_exercises
      (routine_day_id, exercise_id, order_index, target_sets, target_reps_low, target_reps_high, target_rpe, rest_seconds)
    select v_day, e.id, 3, 3, 10, 15, 9, 90
      from public.exercises e
     where e.profile_id is null and lower(e.name) = lower('Seated Leg Curl') and e.equipment = 'machine';
    insert into public.routine_exercises
      (routine_day_id, exercise_id, order_index, target_sets, target_reps_low, target_reps_high, target_rpe, rest_seconds)
    select v_day, e.id, 4, 4, 8, 12, 9, 75
      from public.exercises e
     where e.profile_id is null and lower(e.name) = lower('Standing Calf Raise') and e.equipment = 'machine';
    insert into public.routine_exercises
      (routine_day_id, exercise_id, order_index, target_sets, target_reps_low, target_reps_high, target_rpe, rest_seconds)
    select v_day, e.id, 5, 3, 8, 15, null, 60
      from public.exercises e
     where e.profile_id is null and lower(e.name) = lower('Hanging Leg Raise') and e.equipment = 'bodyweight';

    insert into public.routine_days (routine_id, name, day_index, weekday)
    values (v_routine, 'Upper — Press', 1, 2)
    returning id into v_day;
    insert into public.routine_exercises
      (routine_day_id, exercise_id, order_index, target_sets, target_reps_low, target_reps_high, target_rpe, rest_seconds)
    select v_day, e.id, 0, 4, 5, 8, 8, 180
      from public.exercises e
     where e.profile_id is null and lower(e.name) = lower('Barbell Bench Press') and e.equipment = 'barbell';
    insert into public.routine_exercises
      (routine_day_id, exercise_id, order_index, target_sets, target_reps_low, target_reps_high, target_rpe, rest_seconds)
    select v_day, e.id, 1, 4, 6, 10, 8, 150
      from public.exercises e
     where e.profile_id is null and lower(e.name) = lower('Barbell Row') and e.equipment = 'barbell';
    insert into public.routine_exercises
      (routine_day_id, exercise_id, order_index, target_sets, target_reps_low, target_reps_high, target_rpe, rest_seconds)
    select v_day, e.id, 2, 3, 8, 12, 8.5, 120
      from public.exercises e
     where e.profile_id is null and lower(e.name) = lower('Dumbbell Shoulder Press') and e.equipment = 'dumbbell';
    insert into public.routine_exercises
      (routine_day_id, exercise_id, order_index, target_sets, target_reps_low, target_reps_high, target_rpe, rest_seconds)
    select v_day, e.id, 3, 3, 10, 12, 8.5, 105
      from public.exercises e
     where e.profile_id is null and lower(e.name) = lower('Lat Pulldown') and e.equipment = 'machine';
    insert into public.routine_exercises
      (routine_day_id, exercise_id, order_index, target_sets, target_reps_low, target_reps_high, target_rpe, rest_seconds)
    select v_day, e.id, 4, 3, 12, 20, 9, 60
      from public.exercises e
     where e.profile_id is null and lower(e.name) = lower('Dumbbell Lateral Raise') and e.equipment = 'dumbbell';
    insert into public.routine_exercises
      (routine_day_id, exercise_id, order_index, target_sets, target_reps_low, target_reps_high, target_rpe, rest_seconds)
    select v_day, e.id, 5, 3, 10, 15, 9, 60
      from public.exercises e
     where e.profile_id is null and lower(e.name) = lower('Cable Tricep Pushdown') and e.equipment = 'cable';

    insert into public.routine_days (routine_id, name, day_index, weekday)
    values (v_routine, 'Lower — Hinge', 2, 4)
    returning id into v_day;
    insert into public.routine_exercises
      (routine_day_id, exercise_id, order_index, target_sets, target_reps_low, target_reps_high, target_rpe, rest_seconds)
    select v_day, e.id, 0, 3, 3, 5, 8, 210
      from public.exercises e
     where e.profile_id is null and lower(e.name) = lower('Conventional Deadlift') and e.equipment = 'barbell';
    insert into public.routine_exercises
      (routine_day_id, exercise_id, order_index, target_sets, target_reps_low, target_reps_high, target_rpe, rest_seconds)
    select v_day, e.id, 1, 3, 8, 12, 8.5, 120
      from public.exercises e
     where e.profile_id is null and lower(e.name) = lower('Bulgarian Split Squat') and e.equipment = 'dumbbell';
    insert into public.routine_exercises
      (routine_day_id, exercise_id, order_index, target_sets, target_reps_low, target_reps_high, target_rpe, rest_seconds)
    select v_day, e.id, 2, 3, 8, 12, 8.5, 120
      from public.exercises e
     where e.profile_id is null and lower(e.name) = lower('Barbell Hip Thrust') and e.equipment = 'barbell';
    insert into public.routine_exercises
      (routine_day_id, exercise_id, order_index, target_sets, target_reps_low, target_reps_high, target_rpe, rest_seconds)
    select v_day, e.id, 3, 3, 12, 15, 9, 75
      from public.exercises e
     where e.profile_id is null and lower(e.name) = lower('Leg Extension') and e.equipment = 'machine';
    insert into public.routine_exercises
      (routine_day_id, exercise_id, order_index, target_sets, target_reps_low, target_reps_high, target_rpe, rest_seconds)
    select v_day, e.id, 4, 4, 10, 15, 9, 60
      from public.exercises e
     where e.profile_id is null and lower(e.name) = lower('Seated Calf Raise') and e.equipment = 'machine';

    insert into public.routine_days (routine_id, name, day_index, weekday)
    values (v_routine, 'Upper — Pull', 3, 5)
    returning id into v_day;
    insert into public.routine_exercises
      (routine_day_id, exercise_id, order_index, target_sets, target_reps_low, target_reps_high, target_rpe, rest_seconds)
    select v_day, e.id, 0, 4, 5, 10, 8, 180
      from public.exercises e
     where e.profile_id is null and lower(e.name) = lower('Weighted Pull-Up') and e.equipment = 'bodyweight';
    insert into public.routine_exercises
      (routine_day_id, exercise_id, order_index, target_sets, target_reps_low, target_reps_high, target_rpe, rest_seconds)
    select v_day, e.id, 1, 4, 8, 12, 8, 150
      from public.exercises e
     where e.profile_id is null and lower(e.name) = lower('Incline Dumbbell Press') and e.equipment = 'dumbbell';
    insert into public.routine_exercises
      (routine_day_id, exercise_id, order_index, target_sets, target_reps_low, target_reps_high, target_rpe, rest_seconds)
    select v_day, e.id, 2, 3, 10, 12, 8.5, 120
      from public.exercises e
     where e.profile_id is null and lower(e.name) = lower('Seated Cable Row') and e.equipment = 'cable';
    insert into public.routine_exercises
      (routine_day_id, exercise_id, order_index, target_sets, target_reps_low, target_reps_high, target_rpe, rest_seconds)
    select v_day, e.id, 3, 3, 15, 20, 8, 60
      from public.exercises e
     where e.profile_id is null and lower(e.name) = lower('Cable Face Pull') and e.equipment = 'cable';
    insert into public.routine_exercises
      (routine_day_id, exercise_id, order_index, target_sets, target_reps_low, target_reps_high, target_rpe, rest_seconds)
    select v_day, e.id, 4, 3, 10, 12, 9, 75
      from public.exercises e
     where e.profile_id is null and lower(e.name) = lower('Incline Dumbbell Curl') and e.equipment = 'dumbbell';
    insert into public.routine_exercises
      (routine_day_id, exercise_id, order_index, target_sets, target_reps_low, target_reps_high, target_rpe, rest_seconds)
    select v_day, e.id, 5, 3, 10, 15, 9, 60
      from public.exercises e
     where e.profile_id is null and lower(e.name) = lower('Overhead Cable Extension') and e.equipment = 'cable';
  end if;

  -- Prism 3
  if not exists (select 1 from public.routines where profile_id is null and name = 'Prism 3') then
    insert into public.routines (profile_id, name, description, days_per_week, is_template, is_active)
    values (null, 'Prism 3', 'Three full-body sessions a week. Every session has one squat, one hinge, one push and one pull, rotating the heavy slot so each pattern gets a hard day every week.', 3, true, false)
    returning id into v_routine;

    insert into public.routine_days (routine_id, name, day_index, weekday)
    values (v_routine, 'Full Body — Squat Lead', 0, 1)
    returning id into v_day;
    insert into public.routine_exercises
      (routine_day_id, exercise_id, order_index, target_sets, target_reps_low, target_reps_high, target_rpe, rest_seconds)
    select v_day, e.id, 0, 4, 5, 8, 8, 180
      from public.exercises e
     where e.profile_id is null and lower(e.name) = lower('Back Squat') and e.equipment = 'barbell';
    insert into public.routine_exercises
      (routine_day_id, exercise_id, order_index, target_sets, target_reps_low, target_reps_high, target_rpe, rest_seconds)
    select v_day, e.id, 1, 3, 6, 10, 8, 150
      from public.exercises e
     where e.profile_id is null and lower(e.name) = lower('Barbell Bench Press') and e.equipment = 'barbell';
    insert into public.routine_exercises
      (routine_day_id, exercise_id, order_index, target_sets, target_reps_low, target_reps_high, target_rpe, rest_seconds)
    select v_day, e.id, 2, 3, 10, 12, 8.5, 120
      from public.exercises e
     where e.profile_id is null and lower(e.name) = lower('Seated Cable Row') and e.equipment = 'cable';
    insert into public.routine_exercises
      (routine_day_id, exercise_id, order_index, target_sets, target_reps_low, target_reps_high, target_rpe, rest_seconds)
    select v_day, e.id, 3, 3, 10, 15, 9, 90
      from public.exercises e
     where e.profile_id is null and lower(e.name) = lower('Seated Leg Curl') and e.equipment = 'machine';
    insert into public.routine_exercises
      (routine_day_id, exercise_id, order_index, target_sets, target_reps_low, target_reps_high, target_rpe, rest_seconds)
    select v_day, e.id, 4, 3, 12, 20, 9, 60
      from public.exercises e
     where e.profile_id is null and lower(e.name) = lower('Dumbbell Lateral Raise') and e.equipment = 'dumbbell';

    insert into public.routine_days (routine_id, name, day_index, weekday)
    values (v_routine, 'Full Body — Hinge Lead', 1, 3)
    returning id into v_day;
    insert into public.routine_exercises
      (routine_day_id, exercise_id, order_index, target_sets, target_reps_low, target_reps_high, target_rpe, rest_seconds)
    select v_day, e.id, 0, 4, 6, 10, 8, 180
      from public.exercises e
     where e.profile_id is null and lower(e.name) = lower('Romanian Deadlift') and e.equipment = 'barbell';
    insert into public.routine_exercises
      (routine_day_id, exercise_id, order_index, target_sets, target_reps_low, target_reps_high, target_rpe, rest_seconds)
    select v_day, e.id, 1, 4, 5, 10, 8, 150
      from public.exercises e
     where e.profile_id is null and lower(e.name) = lower('Weighted Pull-Up') and e.equipment = 'bodyweight';
    insert into public.routine_exercises
      (routine_day_id, exercise_id, order_index, target_sets, target_reps_low, target_reps_high, target_rpe, rest_seconds)
    select v_day, e.id, 2, 3, 8, 12, 8.5, 120
      from public.exercises e
     where e.profile_id is null and lower(e.name) = lower('Dumbbell Shoulder Press') and e.equipment = 'dumbbell';
    insert into public.routine_exercises
      (routine_day_id, exercise_id, order_index, target_sets, target_reps_low, target_reps_high, target_rpe, rest_seconds)
    select v_day, e.id, 3, 3, 10, 15, 8.5, 120
      from public.exercises e
     where e.profile_id is null and lower(e.name) = lower('Leg Press') and e.equipment = 'machine';
    insert into public.routine_exercises
      (routine_day_id, exercise_id, order_index, target_sets, target_reps_low, target_reps_high, target_rpe, rest_seconds)
    select v_day, e.id, 4, 3, 10, 15, 9, 60
      from public.exercises e
     where e.profile_id is null and lower(e.name) = lower('Cable Curl') and e.equipment = 'cable';

    insert into public.routine_days (routine_id, name, day_index, weekday)
    values (v_routine, 'Full Body — Press Lead', 2, 5)
    returning id into v_day;
    insert into public.routine_exercises
      (routine_day_id, exercise_id, order_index, target_sets, target_reps_low, target_reps_high, target_rpe, rest_seconds)
    select v_day, e.id, 0, 4, 5, 8, 8, 180
      from public.exercises e
     where e.profile_id is null and lower(e.name) = lower('Standing Overhead Press') and e.equipment = 'barbell';
    insert into public.routine_exercises
      (routine_day_id, exercise_id, order_index, target_sets, target_reps_low, target_reps_high, target_rpe, rest_seconds)
    select v_day, e.id, 1, 3, 6, 10, 8, 180
      from public.exercises e
     where e.profile_id is null and lower(e.name) = lower('Front Squat') and e.equipment = 'barbell';
    insert into public.routine_exercises
      (routine_day_id, exercise_id, order_index, target_sets, target_reps_low, target_reps_high, target_rpe, rest_seconds)
    select v_day, e.id, 2, 3, 10, 12, 8.5, 120
      from public.exercises e
     where e.profile_id is null and lower(e.name) = lower('Chest-Supported Row') and e.equipment = 'machine';
    insert into public.routine_exercises
      (routine_day_id, exercise_id, order_index, target_sets, target_reps_low, target_reps_high, target_rpe, rest_seconds)
    select v_day, e.id, 3, 3, 8, 12, 8.5, 120
      from public.exercises e
     where e.profile_id is null and lower(e.name) = lower('Barbell Hip Thrust') and e.equipment = 'barbell';
    insert into public.routine_exercises
      (routine_day_id, exercise_id, order_index, target_sets, target_reps_low, target_reps_high, target_rpe, rest_seconds)
    select v_day, e.id, 4, 3, 10, 15, 9, 60
      from public.exercises e
     where e.profile_id is null and lower(e.name) = lower('Cable Tricep Pushdown') and e.equipment = 'cable';
  end if;
  -- ---------------------------------------------------------------------
  -- Fail loudly rather than seeding a half-catalogue.
  --
  -- Each `routine_exercises` insert above is a `select` from `exercises`, and a
  -- `select` that matches nothing inserts nothing WITHOUT erroring. So a
  -- template slot naming a movement this file does not create would silently
  -- produce a plan with a hole in it, and the first sign of it would be a
  -- lifter opening a session with four lifts instead of five.
  -- ---------------------------------------------------------------------
  select count(*) into v_system from public.exercises where profile_id is null;
  if v_system < 43 then
    raise exception 'Library seed incomplete: expected at least 43 system exercises, found %', v_system;
  end if;

  select count(*) into v_slots
    from public.routine_exercises re
    join public.routine_days d on d.id = re.routine_day_id
    join public.routines r     on r.id = d.routine_id
   where r.profile_id is null;
  if v_slots <> 38 then
    raise exception 'Template seed incomplete: expected 38 template slots, found %', v_slots;
  end if;
end $$;
