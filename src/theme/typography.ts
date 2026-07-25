import { Platform, type TextStyle } from 'react-native';

/**
 * PRism type system -- "athletic editorial".
 *
 * Two voices in tension:
 *   - DISPLAY / NUMERIC: tight, heavy, negative tracking. Numbers are the hero.
 *   - EYEBROW / LABEL:   small, wide-tracked, uppercase. Acts as editorial rule.
 *
 * We deliberately ship on the platform UI font so the app runs offline with no
 * font-loading flash. To swap in a display face (e.g. a grotesk for headings),
 * change `family.display` here -- nothing else in the codebase needs to move.
 */

export const family = {
  display: Platform.select({
    ios: 'SF Pro Display',
    android: 'sans-serif',
    default: 'System',
  }) as string,
  text: Platform.select({
    ios: 'SF Pro Text',
    android: 'sans-serif',
    default: 'System',
  }) as string,
  /** Tabular figures keep set/rep columns from jittering as values change. */
  numeric: Platform.select({
    ios: 'SF Pro Display',
    android: 'sans-serif-medium',
    default: 'System',
  }) as string,
} as const;

const tabular: TextStyle = Platform.select({
  ios: { fontVariant: ['tabular-nums'] },
  default: {},
}) as TextStyle;

export const type = {
  /** Screen-owning number: readiness score, session volume. */
  hero: {
    fontFamily: family.numeric,
    fontSize: 52,
    lineHeight: 54,
    fontWeight: '800',
    letterSpacing: -1.8,
    ...tabular,
  },
  display: {
    fontFamily: family.display,
    fontSize: 34,
    lineHeight: 38,
    fontWeight: '800',
    letterSpacing: -1.0,
  },
  title1: {
    fontFamily: family.display,
    fontSize: 25,
    lineHeight: 30,
    fontWeight: '700',
    letterSpacing: -0.6,
  },
  title2: {
    fontFamily: family.display,
    fontSize: 19,
    lineHeight: 24,
    fontWeight: '700',
    letterSpacing: -0.35,
  },
  title3: {
    fontFamily: family.text,
    fontSize: 16,
    lineHeight: 21,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  body: {
    fontFamily: family.text,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '500',
    letterSpacing: -0.1,
  },
  bodySm: {
    fontFamily: family.text,
    fontSize: 13.5,
    lineHeight: 19,
    fontWeight: '500',
    letterSpacing: 0,
  },
  label: {
    fontFamily: family.text,
    fontSize: 13,
    lineHeight: 16,
    fontWeight: '600',
    letterSpacing: 0.1,
  },
  /** The editorial rule: uppercase, wide, quiet. Section headers, units. */
  eyebrow: {
    fontFamily: family.text,
    fontSize: 10.5,
    lineHeight: 14,
    fontWeight: '700',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  /** Data cells: weight, reps, RPE. */
  numeric: {
    fontFamily: family.numeric,
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '700',
    letterSpacing: -0.3,
    ...tabular,
  },
  numericLg: {
    fontFamily: family.numeric,
    fontSize: 28,
    lineHeight: 32,
    fontWeight: '800',
    letterSpacing: -1.0,
    ...tabular,
  },
  numericSm: {
    fontFamily: family.numeric,
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '700',
    letterSpacing: -0.1,
    ...tabular,
  },
} satisfies Record<string, TextStyle>;

export type TypeToken = keyof typeof type;
