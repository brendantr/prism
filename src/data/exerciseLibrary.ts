import type { Exercise } from '@/domain/types';

/**
 * PRism system exercise library.
 *
 * Original catalogue written for this app. Each entry carries a short coaching
 * cue in PRism's own voice -- imperative, one line, about execution rather than
 * motivation. Cues appear in the exercise picker and at the top of a logger block.
 */

const ex = (
  id: string,
  name: string,
  equipment: Exercise['equipment'],
  primaryMuscles: Exercise['primaryMuscles'],
  secondaryMuscles: Exercise['secondaryMuscles'],
  cue: string,
  isUnilateral = false,
): Exercise => ({
  id,
  name,
  equipment,
  primaryMuscles,
  secondaryMuscles,
  isUnilateral,
  isSystem: true,
  cue,
});

export const EXERCISE_LIBRARY: Exercise[] = [
  // --- Horizontal push ------------------------------------------------------
  ex('ex_bench_press', 'Barbell Bench Press', 'barbell', ['chest'], ['triceps', 'front_delts'],
    'Ribs down, bar to the low chest, drive the floor away.'),
  ex('ex_incline_bench', 'Incline Barbell Press', 'barbell', ['chest', 'front_delts'], ['triceps'],
    'Thirty degrees is plenty — higher turns it into a shoulder press.'),
  ex('ex_db_bench', 'Dumbbell Bench Press', 'dumbbell', ['chest'], ['triceps', 'front_delts'],
    'Let the elbows travel past the torso, then squeeze the bells together.'),
  ex('ex_db_incline', 'Incline Dumbbell Press', 'dumbbell', ['chest', 'front_delts'], ['triceps'],
    'Stop the descent when the stretch turns into shoulder strain.'),
  ex('ex_machine_chest', 'Machine Chest Press', 'machine', ['chest'], ['triceps', 'front_delts'],
    'Set the handles at nipple height and hold the last inch.'),
  ex('ex_cable_fly', 'Cable Chest Fly', 'cable', ['chest'], ['front_delts'],
    'Soft elbows, long arc, finish with the wrists crossing.'),
  ex('ex_dips', 'Weighted Dip', 'bodyweight', ['chest', 'triceps'], ['front_delts'],
    'Lean forward for chest, stay upright for triceps. Pick one.'),

  // --- Vertical push --------------------------------------------------------
  ex('ex_ohp', 'Standing Overhead Press', 'barbell', ['front_delts'], ['triceps', 'core', 'side_delts'],
    'Squeeze the glutes, move the head back, punch the ceiling.'),
  ex('ex_db_shoulder_press', 'Dumbbell Shoulder Press', 'dumbbell', ['front_delts'], ['triceps', 'side_delts'],
    'Seated with a back pad — save the standing version for the barbell.'),
  ex('ex_lateral_raise', 'Dumbbell Lateral Raise', 'dumbbell', ['side_delts'], ['traps'],
    'Lead with the elbow. If it swings, the weight is winning.'),
  ex('ex_cable_lateral', 'Cable Lateral Raise', 'cable', ['side_delts'], [],
    'Cable behind the body keeps tension through the bottom half.', true),

  // --- Vertical pull --------------------------------------------------------
  ex('ex_pullup', 'Weighted Pull-Up', 'bodyweight', ['lats'], ['biceps', 'upper_back', 'forearms'],
    'Start from a dead hang. Chest to the bar, not chin over it.'),
  ex('ex_lat_pulldown', 'Lat Pulldown', 'machine', ['lats'], ['biceps', 'upper_back'],
    'Pull the elbows into your back pockets, not the bar to your chin.'),
  ex('ex_neutral_pulldown', 'Neutral-Grip Pulldown', 'cable', ['lats'], ['biceps', 'upper_back'],
    'Neutral grip lets you go heavier without the elbow complaint.'),

  // --- Horizontal pull ------------------------------------------------------
  ex('ex_barbell_row', 'Barbell Row', 'barbell', ['upper_back', 'lats'], ['biceps', 'rear_delts', 'lower_back'],
    'Hinge to forty-five degrees and hold it. The torso does not rise with the bar.'),
  ex('ex_db_row', 'Single-Arm Dumbbell Row', 'dumbbell', ['lats', 'upper_back'], ['biceps', 'rear_delts'],
    'Row to the hip, not the armpit. Full stretch at the bottom.', true),
  ex('ex_chest_supported_row', 'Chest-Supported Row', 'machine', ['upper_back'], ['lats', 'biceps', 'rear_delts'],
    'The pad removes the lower back from the equation — use that.'),
  ex('ex_cable_row', 'Seated Cable Row', 'cable', ['upper_back', 'lats'], ['biceps', 'rear_delts'],
    'Let the shoulder blades travel forward, then pull them back together.'),
  ex('ex_face_pull', 'Cable Face Pull', 'cable', ['rear_delts'], ['upper_back', 'traps'],
    'High anchor, pull to the forehead, rotate the knuckles skyward.'),

  // --- Squat pattern --------------------------------------------------------
  ex('ex_back_squat', 'Back Squat', 'barbell', ['quads', 'glutes'], ['core', 'hamstrings', 'lower_back'],
    'Brace before you unrack. Break at hips and knees together.'),
  ex('ex_front_squat', 'Front Squat', 'barbell', ['quads'], ['core', 'glutes', 'upper_back'],
    'Elbows high. The moment they drop, the bar follows.'),
  ex('ex_hack_squat', 'Hack Squat', 'machine', ['quads'], ['glutes'],
    'Feet low on the platform loads the quads hardest.'),
  ex('ex_leg_press', 'Leg Press', 'machine', ['quads', 'glutes'], ['hamstrings'],
    'Stop before the lower back peels off the pad.'),
  ex('ex_bulgarian_split', 'Bulgarian Split Squat', 'dumbbell', ['quads', 'glutes'], ['hamstrings', 'core'],
    'Front shin vertical for glutes, knee travelling forward for quads.', true),
  ex('ex_leg_extension', 'Leg Extension', 'machine', ['quads'], [],
    'Pause at the top for a full second. That second is the whole exercise.'),

  // --- Hinge pattern --------------------------------------------------------
  ex('ex_deadlift', 'Conventional Deadlift', 'barbell', ['glutes', 'hamstrings', 'lower_back'], ['upper_back', 'traps', 'forearms'],
    'Pull the slack out of the bar before anything moves.'),
  ex('ex_rdl', 'Romanian Deadlift', 'barbell', ['hamstrings', 'glutes'], ['lower_back', 'forearms'],
    'Push the hips back until the hamstrings tell you to stop. Then stand.'),
  ex('ex_db_rdl', 'Dumbbell Romanian Deadlift', 'dumbbell', ['hamstrings', 'glutes'], ['lower_back'],
    'Bells stay in contact with the thighs the entire way down.'),
  ex('ex_hip_thrust', 'Barbell Hip Thrust', 'barbell', ['glutes'], ['hamstrings', 'core'],
    'Chin tucked, ribs down, one-second squeeze at lockout.'),
  ex('ex_leg_curl', 'Seated Leg Curl', 'machine', ['hamstrings'], ['calves'],
    'Seated beats lying — the hip flexion adds stretch under load.'),

  // --- Arms -----------------------------------------------------------------
  ex('ex_barbell_curl', 'Barbell Curl', 'barbell', ['biceps'], ['forearms'],
    'Elbows pinned to the ribs. If they drift forward, the set is over.'),
  ex('ex_incline_curl', 'Incline Dumbbell Curl', 'dumbbell', ['biceps'], ['forearms'],
    'The behind-the-body position is the point. Do not shorten it.'),
  ex('ex_hammer_curl', 'Hammer Curl', 'dumbbell', ['biceps', 'forearms'], [],
    'Neutral grip biases the brachialis — thickness, not peak.'),
  ex('ex_cable_curl', 'Cable Curl', 'cable', ['biceps'], ['forearms'],
    'Constant tension top to bottom. Slow the eccentric down.'),
  ex('ex_skullcrusher', 'EZ-Bar Skullcrusher', 'barbell', ['triceps'], [],
    'Lower behind the head, not to the forehead. Elbows stay stacked.'),
  ex('ex_pushdown', 'Cable Tricep Pushdown', 'cable', ['triceps'], [],
    'Lock the elbows at your sides and let only the forearms move.'),
  ex('ex_overhead_ext', 'Overhead Cable Extension', 'cable', ['triceps'], [],
    'Overhead loads the long head at full stretch. Do not rush the bottom.'),

  // --- Trunk & calves -------------------------------------------------------
  ex('ex_standing_calf', 'Standing Calf Raise', 'machine', ['calves'], [],
    'Full sink at the bottom, two-second hold at the top.'),
  ex('ex_seated_calf', 'Seated Calf Raise', 'machine', ['calves'], [],
    'Bent knee shifts the work to the soleus. Go slow, go heavy.'),
  ex('ex_hanging_raise', 'Hanging Leg Raise', 'bodyweight', ['core'], ['forearms'],
    'Curl the pelvis up. Swinging legs are just a grip exercise.'),
  ex('ex_cable_crunch', 'Cable Crunch', 'cable', ['core'], [],
    'Round the spine down toward the hips — this is not a hip flexor drill.'),
  ex('ex_back_extension', 'Back Extension', 'bodyweight', ['lower_back', 'glutes'], ['hamstrings'],
    'Stop at a straight line. Hyperextending buys you nothing.'),
  ex('ex_shrug', 'Dumbbell Shrug', 'dumbbell', ['traps'], ['forearms'],
    'Straight up, brief hold, no rolling.'),
];

export const EXERCISE_BY_ID = new Map(EXERCISE_LIBRARY.map((e) => [e.id, e]));

export function getExercise(id: string): Exercise | undefined {
  return EXERCISE_BY_ID.get(id);
}

export function exerciseName(id: string): string {
  return EXERCISE_BY_ID.get(id)?.name ?? 'Unknown exercise';
}
