import type { AuthFailure } from '@/domain/authErrors';
import { PASSWORD_MIN_LENGTH, type AuthFieldError } from '@/domain/authValidation';
import type { Equipment, Experience, Goal } from '@/domain/types';

/**
 * ONBOARDING COPY
 * ===============
 * Every user-facing string in the onboarding flow lives here so it can be
 * rewritten, reviewed, or localised without opening a screen file.
 *
 * This is first-pass copy. It is written to PRism's existing posture -- the app
 * describes what it estimates and says so plainly -- and deliberately makes no
 * clinical, diagnostic, or injury-prevention claim (`Docs/invariants.md` I-8).
 */

export const WELCOME = {
  eyebrow: 'Welcome to PRism',
  title: 'See your training from every angle.',
  body:
    'A logger for lifters who want to understand the numbers, not just collect them. Every estimate PRism shows you comes with its reasoning attached.',
  primaryCta: 'Get started',
  secondaryCta: 'I already have an account',
} as const;

export interface FeatureSlide {
  id: 'log' | 'progress' | 'readiness';
  /** e.g. "01 / LOG" -- the section-index badge, not a generic label. */
  eyebrow: string;
  title: string;
  body: string;
}

export const FEATURE_SLIDES: FeatureSlide[] = [
  {
    id: 'log',
    eyebrow: '01 / LOG',
    title: 'Log what happened.',
    body: 'Sets, reps, and load — recorded in seconds. That is the evidence every estimate PRism shows you later is built from.',
  },
  {
    id: 'progress',
    eyebrow: '02 / PROGRESS',
    title: 'Every number can be interrogated.',
    body: 'Estimated 1RM, volume, and load suggestions all show the rule that produced them, so you can disagree with one.',
  },
  {
    id: 'readiness',
    eyebrow: '03 / READINESS',
    title: 'Honest about what it cannot see.',
    body: 'A readiness estimate that says "not enough input yet" instead of inventing a confident-looking score.',
  },
];

export const FEATURES = {
  primaryCta: 'Continue',
  /** Shown on the last slide only -- this hands off to auth, same as `primaryCta` does elsewhere. */
  finalCta: 'Get started',
  skipLabel: 'Skip',
} as const;

/**
 * ONBOARDING DEMO DATA
 * ====================
 * Static, presentation-only content for the Log/Progress onboarding slides.
 * This is fixed fictional sample data for illustrating the product -- it is
 * never read from `trainingStore`, any repository, or any real session, and
 * must never be wired to either. Every derived number here is computed
 * through the real `estimateOneRepMax` (Epley) function rather than typed by
 * hand, so the onboarding preview can never quietly drift out of sync with
 * the formula it claims to demonstrate.
 */

export interface OnboardingDemoSet {
  weightKg: number;
  reps: number;
  rpe: number;
}

export const ONBOARDING_LOG_DEMO = {
  exerciseName: 'Back Squat',
  sets: [
    { weightKg: 100, reps: 5, rpe: 8 },
    { weightKg: 100, reps: 5, rpe: 8 },
    { weightKg: 100, reps: 5, rpe: 8 },
  ] satisfies OnboardingDemoSet[],
} as const;

/**
 * Eight weekly (load, reps) samples. Deliberately the same lift and the same
 * final set as `ONBOARDING_LOG_DEMO`, so the Log and Progress slides tell one
 * coherent story rather than two disconnected mockups. Each point's estimated
 * 1RM is computed at render time via `estimateOneRepMax`, not stored here.
 */
export const ONBOARDING_PROGRESS_DEMO = {
  weeklySamples: [
    { weekLabel: '8 weeks ago', weightKg: 88, reps: 5 },
    { weekLabel: '7 weeks ago', weightKg: 90, reps: 5 },
    { weekLabel: '6 weeks ago', weightKg: 91, reps: 5 },
    { weekLabel: '5 weeks ago', weightKg: 90, reps: 6 },
    { weekLabel: '4 weeks ago', weightKg: 94, reps: 5 },
    { weekLabel: '3 weeks ago', weightKg: 96, reps: 5 },
    { weekLabel: '2 weeks ago', weightKg: 95, reps: 6 },
    { weekLabel: 'Today', weightKg: 100, reps: 5 },
  ] satisfies Array<{ weekLabel: string; weightKg: number; reps: number }>,
} as const;

export const ONBOARDING_READINESS_DEMO = {
  rows: [
    {
      key: 'training',
      title: 'Recent training',
      hasInput: true,
      subtitle: '3 sessions logged this week',
    },
    {
      key: 'sleep',
      title: 'Sleep',
      hasInput: false,
      subtitle: 'No input yet',
    },
    {
      key: 'recovery',
      title: 'Recovery',
      hasInput: false,
      subtitle: 'No input yet',
    },
  ] as const,
  disclaimer:
    'Readiness is a planning estimate built from what you log — training, sleep, recovery. It is never a diagnosis, and it is never medical advice.',
} as const;

export const AUTH = {
  eyebrow: 'Your account',
  titleSignUp: 'Create your account',
  titleSignIn: 'Welcome back',
  bodySignUp: 'Your training data stays yours. Nothing is shared, and nothing is posted anywhere.',
  bodySignIn: 'Sign in to pick up where you left off.',
  emailLabel: 'Email',
  emailPlaceholder: 'you@example.com',
  passwordLabel: 'Password',
  /** The rule is interpolated, never retyped, so copy and policy cannot drift. */
  passwordPlaceholderSignUp: `At least ${PASSWORD_MIN_LENGTH} characters`,
  passwordPlaceholderSignIn: 'Your password',
  /** Shown on sign-up only: sign-in has no minimum to explain. */
  passwordHintSignUp:
    'Length beats complexity. A few unrelated words you will remember make a strong password — no capitals, digits or symbols required.',
  primaryCtaSignUp: 'Create account',
  primaryCtaSignIn: 'Sign in',
  toggleToSignIn: 'Already have an account? Sign in',
  toggleToSignUp: 'New here? Create an account',
  /*
    `skipLabel` and `placeholderNotice` are gone, together and on purpose.

    They were the honest half of a screen that could not create an account
    (UX decision D2). The form works now, so the notice would be false and the
    skip would lead somewhere that no longer exists -- every data screen needs a
    session. D2's reversal clause requires copy, skip semantics, the completion
    gate and the autofill attributes to change as one unit, which is why their
    absence is asserted by `src/content/__tests__/onboarding.test.ts`: a partial
    reversal is the failure mode worth pinning.

    TODO(docs): supersede D2 in `Docs/ui-ux-foundation-v1.md` and close §9
    open question 1 (auth is hidden in demo builds -- `src/domain/routing.ts`).
  */
  checkEmailTitle: 'Confirm your email',
  checkEmailBody:
    'We sent a confirmation link to your address. Open it, then come back here and sign in.',
  checkEmailCta: 'Back to sign in',
  signedOutNotice: 'You have been signed out. Sign in to continue.',
} as const;

/** One sentence per validation failure. Keyed by the domain's error codes. */
export const AUTH_ERROR_COPY: Record<AuthFieldError, string> = {
  email_required: 'Enter your email address.',
  email_invalid: 'That does not look like an email address.',
  password_required: 'Enter a password.',
  password_too_short: `Use at least ${PASSWORD_MIN_LENGTH} characters.`,
};

/**
 * One sentence per auth outcome. Keyed by `src/domain/authErrors.ts`.
 *
 * ACCOUNT ENUMERATION
 * -------------------
 * `invalidCredentials` covers a wrong password *and* an address with no
 * account, and says so in neither case. Splitting them would turn this form
 * into an oracle for "does this person use PRism", against a product that
 * stores sleep, soreness and bodyweight. Supabase returns the same 400 for
 * both, so the single message is what the server already behaves like.
 *
 * Sign-up is subject to the same rule from the other direction: an address
 * that already has an account gets the same `checkEmail` outcome as a new one.
 *
 * Nothing here names an environment variable, an endpoint, or a raw error --
 * `toAuthFailure` maps unrecognised shapes to `unknown` precisely so nothing
 * unreviewed can reach a screen. Pinned by the copy tests.
 */
export const AUTH_OUTCOME_COPY: Record<AuthFailure, string> = {
  invalidCredentials: 'That email and password do not match an account.',
  rateLimited: 'Too many attempts. Wait a minute and try again.',
  network: 'PRism could not reach the server. Check your connection and try again.',
  sessionExpired: 'You have been signed out. Sign in to continue.',
  checkEmail: 'Check your email for a confirmation link, then sign in.',
  unknown: 'Something went wrong. Try again.',
};

/**
 * Whether an outcome is a failure or a normal next step.
 *
 * `checkEmail` is the reason this exists: it travels in the same channel as the
 * failures (`sessionStore.lastFailure`) because it is the result of the same
 * attempt, but it is a success and must not be rendered in the error tone.
 */
export const AUTH_OUTCOME_TONE: Record<AuthFailure, 'error' | 'notice'> = {
  invalidCredentials: 'error',
  rateLimited: 'error',
  network: 'error',
  sessionExpired: 'notice',
  checkEmail: 'notice',
  unknown: 'error',
};

export interface StepOption<T extends string | number> {
  value: T;
  label: string;
  description?: string;
}

export const GOAL_OPTIONS: StepOption<Goal>[] = [
  { value: 'strength', label: 'Get stronger', description: 'Heavier top sets, lower reps' },
  { value: 'hypertrophy', label: 'Build muscle', description: 'Volume across a rep range' },
  { value: 'general_fitness', label: 'Stay in shape', description: 'Consistency over peaking' },
  { value: 'fat_loss', label: 'Lean out', description: 'Hold strength while cutting' },
];

export const EXPERIENCE_OPTIONS: StepOption<Experience>[] = [
  { value: 'beginner', label: 'Newer to lifting', description: 'Under a year of consistent training' },
  { value: 'intermediate', label: 'A few years in', description: 'Progress now comes in blocks' },
  { value: 'advanced', label: 'Long-time lifter', description: 'Progress is measured over months' },
];

export const DAYS_OPTIONS: StepOption<number>[] = [
  { value: 3, label: '3 days a week' },
  { value: 4, label: '4 days a week' },
  { value: 5, label: '5 days a week' },
  { value: 6, label: '6 days a week' },
];

export const EQUIPMENT_OPTIONS: StepOption<Equipment>[] = [
  { value: 'barbell', label: 'Barbell' },
  { value: 'dumbbell', label: 'Dumbbells' },
  { value: 'machine', label: 'Machines' },
  { value: 'cable', label: 'Cables' },
  { value: 'bodyweight', label: 'Bodyweight only' },
  { value: 'kettlebell', label: 'Kettlebells' },
  { value: 'band', label: 'Bands' },
  { value: 'smith', label: 'Smith machine' },
];

export const STEPS = {
  goal: {
    eyebrow: 'Step one',
    title: 'What are you training for?',
    body: 'This shapes the rep ranges PRism suggests. You can change it any time.',
  },
  experience: {
    eyebrow: 'Step two',
    title: 'How long have you been lifting?',
    body: 'Experience changes how quickly PRism suggests adding load.',
  },
  days: {
    eyebrow: 'Step three',
    title: 'How often can you train?',
    body: 'Your own target, not a prescription. Consistency is measured against it.',
  },
  equipment: {
    eyebrow: 'Step four',
    title: 'What do you have access to?',
    body: 'Pick everything available. Exercise suggestions are filtered to match.',
  },
  primaryCta: 'Continue',
  finalCta: 'Finish setup',
  /** Every question is skippable; a skipped answer stays unset, not defaulted. */
  skipLabel: 'Skip',
} as const;

export const COMPLETE = {
  eyebrow: 'You are set up',
  title: 'Ready when you are.',
  body:
    'PRism opens on eight weeks of sample training so nothing looks empty. Log a real session whenever you want and it saves on this device.',
  primaryCta: 'Start training',
  summaryEyebrow: 'What you told us',
  /** Shown for any question that was skipped. Never a stand-in value. */
  notSet: 'Not set',
  /**
   * Honest about where these answers currently go. The selections are persisted
   * locally but not applied to the training profile -- see `onboardingStore`.
   */
  summaryNote:
    'Kept on this device. These answers are not applied to your training profile yet, so nothing in the app changes because of them.',
  summaryLabels: {
    goal: 'Training for',
    experience: 'Experience',
    days: 'Sessions a week',
    equipment: 'Equipment',
  },
} as const;
