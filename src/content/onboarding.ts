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
  id: string;
  eyebrow: string;
  title: string;
  body: string;
  icon: 'flash' | 'trending-up' | 'body';
}

export const FEATURE_SLIDES: FeatureSlide[] = [
  {
    id: 'log',
    eyebrow: 'Log',
    title: 'Built for the bench, not the desk.',
    body: 'Big targets, tabular numbers, and a rest timer that keeps running while your phone is face down between sets.',
    icon: 'flash',
  },
  {
    id: 'progress',
    eyebrow: 'Progress',
    title: 'Every number can be interrogated.',
    body: 'Estimated 1RM, volume, and load suggestions all show the rule that produced them, so you can disagree with one.',
    icon: 'trending-up',
  },
  {
    id: 'readiness',
    eyebrow: 'Readiness',
    title: 'Honest about what it cannot see.',
    body: 'A readiness estimate that says "not enough input yet" instead of inventing a confident-looking score. It is a planning estimate, never a health metric.',
    icon: 'body',
  },
];

export const FEATURES = {
  primaryCta: 'Continue',
  skipLabel: 'Skip',
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
  skipLabel: 'Later',
  /** Accounts are not wired up yet; this is stated rather than implied. */
  placeholderNotice:
    'Accounts are not connected yet. Continue to explore PRism on this device with sample training data.',
} as const;

/** One sentence per validation failure. Keyed by the domain's error codes. */
export const AUTH_ERROR_COPY: Record<AuthFieldError, string> = {
  email_required: 'Enter your email address.',
  email_invalid: 'That does not look like an email address.',
  password_required: 'Enter a password.',
  password_too_short: `Use at least ${PASSWORD_MIN_LENGTH} characters.`,
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
} as const;

export const COMPLETE = {
  eyebrow: 'You are set up',
  title: 'Ready when you are.',
  body:
    'PRism opens on eight weeks of sample training so nothing looks empty. Log a real session whenever you want and it saves on this device.',
  primaryCta: 'Start training',
} as const;
