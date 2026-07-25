/**
 * PRism design tokens.
 *
 * The whole visual language derives from one idea: white light entering a prism
 * and separating into a spectrum. Surfaces are near-black and quiet; colour only
 * appears where the app is telling you something (progress, load, recovery).
 *
 * Every value in this file is a primitive. Components must never hardcode a hex
 * value, a font size, or a raw pixel gap -- they reference these tokens so the
 * entire product can be re-tuned from one place.
 */

// ---------------------------------------------------------------------------
// Palette (primitives -- do not use directly in components, use `color` below)
// ---------------------------------------------------------------------------

const palette = {
  ink000: '#07070B', // near-black canvas
  ink050: '#0B0B12',
  ink100: '#10101A',
  ink200: '#16161F',
  ink300: '#1D1D29',
  ink400: '#272736',
  ink500: '#3A3A4D',

  violet300: '#B79BFF',
  violet400: '#9B6BFF',
  violet500: '#7A3BFF', // electric violet -- primary brand
  violet600: '#5F23E0',

  cyan300: '#7DF0FF',
  cyan400: '#3FDDF2',
  cyan500: '#16C4DE', // spectral secondary
  cyan600: '#0C97AD',

  coral300: '#FFA79B',
  coral400: '#FF7F70',
  coral500: '#F2604E', // restrained accent -- attention, never decoration

  mint400: '#4ADE9B',
  amber400: '#F5B84B',

  white: '#FFFFFF',
  fog050: '#F5F5FA',
  fog200: '#C9C9D9',
  fog400: '#9494AC',
  fog600: '#63637A',
  fog700: '#4A4A5E',
} as const;

// ---------------------------------------------------------------------------
// Semantic colour
// ---------------------------------------------------------------------------

export const color = {
  // Surfaces, darkest to lightest
  bg: palette.ink000,
  surface: palette.ink050,
  card: palette.ink100,
  cardRaised: palette.ink200,
  inset: palette.ink300,
  overlay: 'rgba(7, 7, 11, 0.82)',

  // Hairlines. Kept extremely low contrast -- structure comes from spacing.
  line: 'rgba(255, 255, 255, 0.07)',
  lineStrong: 'rgba(255, 255, 255, 0.14)',

  // Text. `primary` on `bg` = 18.7:1, `secondary` = 7.4:1, `tertiary` = 4.6:1.
  text: palette.fog050,
  textSecondary: palette.fog200,
  textMuted: palette.fog400,
  textFaint: palette.fog600,
  textOnAccent: '#0A0A10',

  // Brand spectrum
  violet: palette.violet500,
  violetBright: palette.violet400,
  violetSoft: palette.violet300,
  cyan: palette.cyan500,
  cyanBright: palette.cyan400,
  cyanSoft: palette.cyan300,
  coral: palette.coral500,
  coralBright: palette.coral400,

  // Status
  positive: palette.mint400,
  caution: palette.amber400,
  critical: palette.coral400,

  // Translucent accent washes for chips / rings / fills
  violetWash: 'rgba(122, 59, 255, 0.16)',
  cyanWash: 'rgba(22, 196, 222, 0.14)',
  coralWash: 'rgba(242, 96, 78, 0.14)',
  positiveWash: 'rgba(74, 222, 155, 0.14)',
  neutralWash: 'rgba(255, 255, 255, 0.06)',
} as const;

/**
 * The spectral gradient. Used as a thin 1-3px band, a ring stroke, or a
 * progress fill -- never as a large background slab.
 */
export const spectrum = {
  stops: [palette.violet500, palette.violet400, palette.cyan500] as const,
  warm: [palette.violet500, palette.coral500] as const,
  cool: [palette.cyan500, palette.violet400] as const,
} as const;

/** Fixed hues used by the muscle/recovery visualisations. */
export const recoveryScale = {
  fresh: palette.mint400,
  ready: palette.cyan400,
  moderate: palette.violet400,
  fatigued: palette.amber400,
  depleted: palette.coral400,
} as const;

// ---------------------------------------------------------------------------
// Spacing -- 4pt base, non-linear at the top end for editorial breathing room
// ---------------------------------------------------------------------------

export const space = {
  none: 0,
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  xxxl: 44,
  huge: 64,
} as const;

export const radius = {
  xs: 6,
  sm: 10,
  md: 16,
  lg: 22,
  xl: 30,
  pill: 999,
} as const;

/** Minimum interactive size. Enforced by `Pressable` primitives. */
export const a11y = {
  minTouch: 44,
  minTouchCompact: 44,
} as const;

export const border = {
  hairline: 1,
  thick: 1.5,
} as const;

/**
 * Elevation is expressed as tinted glow rather than grey drop-shadow, so cards
 * read as emissive panels on a black canvas instead of paper.
 */
export const elevation = {
  none: {},
  card: {
    shadowColor: '#000000',
    shadowOpacity: 0.5,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  glowViolet: {
    shadowColor: palette.violet500,
    shadowOpacity: 0.45,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
  glowCyan: {
    shadowColor: palette.cyan500,
    shadowOpacity: 0.4,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
} as const;

export const duration = {
  instant: 120,
  fast: 180,
  base: 260,
  slow: 420,
} as const;

export const opacity = {
  pressed: 0.62,
  disabled: 0.38,
} as const;

export type ColorToken = keyof typeof color;
export type SpaceToken = keyof typeof space;
export type RadiusToken = keyof typeof radius;
