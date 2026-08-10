import type { Ionicons } from '@expo/vector-icons';
import { KEY_LIFT_MIN_SESSIONS, KEY_LIFT_WINDOW_WEEKS } from '@/domain/calc/keyLifts';

/**
 * ZERO-DATA COPY
 * ==============
 * What Insights, Progress and Body say to an account that has logged nothing.
 *
 * **Why this module exists.** Demo mode seeds eight weeks of training, so every
 * derived surface was built and reviewed against a full history. A real account
 * starts at zero, and each of these three screens had its own way of getting
 * that wrong: Insights and Progress guarded their empty states on a missing
 * profile, which never happens once the store is ready, so a new lifter got a
 * wall of zeros and a bare title instead; Body rendered sixteen muscles at 100%
 * recovered, a confident-looking screen built entirely out of absent input.
 *
 * **The rule these strings follow.** Say what is missing, say what produces it,
 * and offer the way out. Per I-18 a lack of data is stated as a lack of data --
 * never dressed up as a neutral or reassuring result. Per I-8 nothing here
 * claims to diagnose, measure clinically, or prevent anything; `zeroDataCopy.test.ts`
 * pins both, plus D11's rule that this copy lives here rather than inline in a
 * screen (`Docs/ui-ux-foundation-v1.md`).
 *
 * `actionLabel`/`route` are the same first step on all three, deliberately: the
 * only thing that fixes any of these is finishing a session, and History's empty
 * state already points there.
 */

export interface ZeroDataState {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
  actionLabel: string;
  route: '/workout/templates';
}

/** Every full-screen zero-history state, one entry per screen. */
export const ZERO_DATA: Record<'insights' | 'progress' | 'body', ZeroDataState> = {
  /*
    Carried over from `app/(tabs)/insights.tsx`, where it was written well and
    then made unreachable by the guard above it. Moved rather than rewritten --
    the words were never the problem.
  */
  insights: {
    icon: 'sparkles-outline',
    title: 'Nothing to read yet',
    body: 'Insights appear once you have finished a session or two. There is no shortcut — the numbers come from your own training.',
    actionLabel: 'Choose a workout',
    route: '/workout/templates',
  },

  progress: {
    icon: 'trending-up-outline',
    title: 'No trend to plot yet',
    body: 'Progress is drawn from sessions you have finished — estimated 1RM, volume, and how they move. Finish one and this screen starts filling in.',
    actionLabel: 'Choose a workout',
    route: '/workout/templates',
  },

  /*
    The one that matters most for I-18. It has to say the estimate is absent,
    not that recovery is complete -- "you are fully recovered" is precisely the
    confident answer the sixteen 100% rows were accidentally giving.
  */
  body: {
    icon: 'body-outline',
    title: 'Nothing to estimate from yet',
    body: 'Recovery is estimated from sessions you have logged — how recently a muscle was trained and how much it absorbed. With nothing logged there is nothing to estimate, so PRism shows you this instead of a guess.',
    actionLabel: 'Choose a workout',
    route: '/workout/templates',
  },
};

/**
 * The key-lifts panel, which can be empty on a screen that is otherwise full:
 * a lifter three sessions in has volume and session counts to show, and still
 * no movement repeated often enough to draw a line through.
 *
 * Spans are interpolated from the constants in `domain/calc/keyLifts` rather
 * than typed out, because the last time this heading carried a hard-coded "8
 * weeks" it went on claiming it after the window changed underneath it.
 */
export const KEY_LIFTS_COPY = {
  sectionTitle: 'Key lifts',
  sectionEyebrow: `Estimated 1RM, last ${KEY_LIFT_WINDOW_WEEKS} weeks`,
  emptyIcon: 'barbell-outline' as keyof typeof Ionicons.glyphMap,
  emptyTitle: 'No repeated lift yet',
  emptyBody: `A trend needs the same movement in at least ${KEY_LIFT_MIN_SESSIONS} sessions in the last ${KEY_LIFT_WINDOW_WEEKS} weeks. Train a lift again and it appears here, most-trained first.`,
} as const;
