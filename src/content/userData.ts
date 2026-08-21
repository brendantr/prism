import type {
  Equipment,
  Experience,
  Goal,
  MuscleGroup,
  Unit,
} from '@/domain/types';
import type { CustomExerciseProblem } from '@/domain/customExercise';
import type { MeasurementProblem } from '@/domain/measurements';

/** Reviewed copy for the three user-data surfaces added in this sprint. */
export const SETTINGS_COPY = {
  eyebrow: 'Your preferences',
  title: 'Settings',
  save: 'Save settings',
  saving: 'Saving settings…',
  savedTitle: 'Settings saved',
  savedMessage: 'Your profile and training preferences are up to date.',
  failedTitle: 'Could not save settings',
  failedMessage:
    'Some changes may already be saved. Close and reopen Settings to review them, then try again.',
  profileSection: 'Profile',
  trainingSection: 'Training',
  planSection: 'Active plan',
  equipmentSection: 'Available equipment',
  accountSection: 'Account',
  accountLabel: 'Account and privacy',
  accountSubtitle: 'Sign out, export your data, or delete your account',
  privacySection: 'Privacy',
  privacyPolicyLabel: 'Privacy Policy',
  privacyPolicySubtitle: 'Opens the public policy in your browser',
  privacyPolicyFailedTitle: 'Could not open the Privacy Policy',
  privacyPolicyFailedMessage: 'Check your connection and try again.',
  displayNameLabel: 'Display name',
  displayNameHint: 'Shown only inside your Repello account.',
  displayNameRequired: 'Enter a display name.',
  displayNameLong: 'Keep your display name to 60 characters or fewer.',
  bodyweightLabel: 'Bodyweight',
  bodyweightHint: (unit: Unit) => `Optional · ${unit}`,
  bodyweightError: 'Enter a bodyweight greater than zero and no more than 500 kg.',
  unitLabel: 'Display units',
  goalLabel: 'Training goal',
  experienceLabel: 'Experience',
  daysLabel: 'Sessions per week',
  weekdaysLabel: 'Preferred training days',
  weekdaysHint: 'These are planning preferences, not required days.',
  planHint:
    'Choosing a Repello plan also sets its weekly session target and pinned training days.',
} as const;

export const EXERCISE_COPY = {
  createTitle: 'New movement',
  editTitle: 'Edit movement',
  eyebrow: 'Your exercise library',
  createAction: 'Add movement',
  createAndAddAction: 'Save and add to session',
  updateAction: 'Save changes',
  deleteAction: 'Delete movement',
  deletingAction: 'Deleting movement…',
  saveFailedTitle: 'Could not save movement',
  saveFailedMessage: 'Nothing changed. Check your connection and try again.',
  deleteFailedTitle: 'Could not delete movement',
  deleteFailedMessage: 'The movement and your logged sessions are unchanged.',
  deleteTitle: 'Delete this movement?',
  deleteUnusedMessage: (name: string) =>
    `“${name}” will be removed from your library. This cannot be undone.`,
  inUseTitle: 'This movement has logged history',
  inUseMessage: (name: string, workouts: number, sets: number) =>
    `“${name}” is used by ${workouts} ${workouts === 1 ? 'session' : 'sessions'} and ${sets} ${
      sets === 1 ? 'set' : 'sets'
    }. Repello keeps the movement so that history stays intact.`,
  inUseFallbackMessage: (name: string) =>
    `“${name}” is part of your logged history. Repello keeps the movement so that history stays intact.`,
  activeUseMessage: (name: string) =>
    `“${name}” is in the workout currently in progress. Remove it from that workout before deleting the movement.`,
  nameLabel: 'Movement name',
  equipmentLabel: 'Equipment',
  primaryLabel: 'Primary muscles',
  secondaryLabel: 'Assisting muscles',
  unilateralLabel: 'Loaded one side at a time',
  unilateralDescription: 'Used only for load rounding and display.',
  cueLabel: 'Optional cue',
  cueHint: 'A short reminder in your own words.',
} as const;

export const CUSTOM_EXERCISE_PROBLEM: Record<CustomExerciseProblem, string> = {
  name_missing: 'Enter a movement name.',
  name_too_long: 'Keep the name to 60 characters or fewer.',
  cue_too_long: 'Keep the cue to 200 characters or fewer.',
  primary_muscle_missing: 'Choose at least one primary muscle.',
  muscle_in_both: 'A muscle cannot be both primary and assisting.',
};

export const MEASUREMENT_COPY = {
  eyebrow: 'Numbers you enter',
  createTitle: 'Add measurement',
  editTitle: 'Edit measurement',
  addAction: 'Add a measurement',
  saveAction: 'Save measurement',
  updateAction: 'Save changes',
  deleteAction: 'Delete measurement',
  bodyweightLabel: 'Bodyweight',
  bodyFatLabel: 'Body fat',
  waistLabel: 'Waist',
  optionalHint: 'Optional',
  bodyweightHint: (unit: Unit) => `Optional · ${unit}`,
  bodyFatHint: 'Optional · percent',
  waistHint: 'Optional · centimetres',
  explainer:
    'Measurements are optional numbers you enter for your own record. Repello does not interpret them as a health assessment.',
  deleteTitle: 'Delete this measurement?',
  deleteMessage: 'This entry will be removed from your history. This cannot be undone.',
  saveFailedTitle: 'Could not save measurement',
  saveFailedMessage: 'Nothing changed. Check your connection and try again.',
  deleteFailedTitle: 'Could not delete measurement',
  deleteFailedMessage: 'The measurement is still in your history.',
  emptyTitle: 'No measurements yet',
  emptyBody: 'Add only the numbers you want to keep. Every field is optional.',
} as const;

export const MEASUREMENT_PROBLEM: Record<MeasurementProblem, string> = {
  nothing_entered: 'Enter at least one measurement.',
  bodyweight_invalid: 'Enter a bodyweight greater than zero and no more than 500 kg.',
  body_fat_invalid: 'Enter a body-fat value from 1 to 70 percent.',
  waist_invalid: 'Enter a waist measurement greater than zero and no more than 300 cm.',
};

export const UNIT_LABEL: Record<Unit, string> = { kg: 'Kilograms', lb: 'Pounds' };

export const GOAL_LABEL: Record<Goal, string> = {
  strength: 'Strength',
  hypertrophy: 'Muscle gain',
  general_fitness: 'General fitness',
  fat_loss: 'Fat loss',
};

export const EXPERIENCE_LABEL: Record<Experience, string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
};

export const EQUIPMENT_LABEL: Record<Equipment, string> = {
  barbell: 'Barbell',
  dumbbell: 'Dumbbells',
  machine: 'Machines',
  cable: 'Cables',
  bodyweight: 'Bodyweight',
  kettlebell: 'Kettlebells',
  band: 'Bands',
  smith: 'Smith machine',
};

export const MUSCLE_LABEL: Record<MuscleGroup, string> = {
  chest: 'Chest',
  front_delts: 'Front delts',
  side_delts: 'Side delts',
  rear_delts: 'Rear delts',
  lats: 'Lats',
  upper_back: 'Upper back',
  traps: 'Traps',
  lower_back: 'Lower back',
  biceps: 'Biceps',
  triceps: 'Triceps',
  forearms: 'Forearms',
  core: 'Core',
  glutes: 'Glutes',
  quads: 'Quads',
  hamstrings: 'Hamstrings',
  calves: 'Calves',
};

export const WEEKDAY_LABEL: Record<number, string> = {
  1: 'Mon',
  2: 'Tue',
  3: 'Wed',
  4: 'Thu',
  5: 'Fri',
  6: 'Sat',
  7: 'Sun',
};
