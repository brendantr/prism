import type { Ionicons } from '@expo/vector-icons';

/**
 * THE DEEPER SURFACES
 * ===================
 * Progress, Body and History are the three screens that sit outside the tab
 * bar. Today and Insights both offer a way into all three, and before this
 * module they did it twice over: different wording for the same destination,
 * a different order, and two different section eyebrows over the same
 * "Go deeper" heading. A lifter moving between the two screens met the same
 * three surfaces described as if they were different things.
 *
 * One list, in one order, in one voice. Today and Insights both render it as
 * a `ListRow` card now (`Docs/ui-ux-foundation-v1.md` D9) -- neither the
 * words nor the container is owned by either screen any more.
 *
 * **Two captions per surface, on purpose.** `tileCaption` is currently
 * unused (Today's tile layout was retired when it moved to `ListRow`) but is
 * kept rather than deleted: a tile is roughly 75pt wide on a
 * compact device and clips at two short lines; a list row has the full screen
 * width and can afford a clause. Writing one string for both is what produced
 * "Every finished s…" on an iPhone SE. So each surface carries a short form and
 * a long form, and the caller picks the one its layout can actually hold.
 *
 * Order is narrative, not alphabetical: what you did, then how it is trending,
 * then how recovered you are.
 */

export interface DeeperSurface {
  key: 'history' | 'progress' | 'body';
  /** Same label in both presentations -- this is the screen's name. */
  label: string;
  /** Tile form. Two short lines at ~75pt; keep it under ~22 characters. */
  tileCaption: string;
  /** Row form. Full width, so it can name what the screen actually answers. */
  rowSubtitle: string;
  /**
   * Base Ionicons glyph. Rows use it as-is; tiles append `-outline`, keeping
   * the tiles quieter than the tinted rows they mirror.
   */
  icon: keyof typeof Ionicons.glyphMap;
  /** Tint for the row's glyph tile. Tiles are deliberately untinted. */
  iconTone: 'violet' | 'cyan';
  route: '/history' | '/(tabs)/progress' | '/(tabs)/body';
  /**
   * Whether this surface is behind the one-time unlock
   * (`Docs/decisions/ADR-0005-monetization.md`).
   *
   * **Per surface, never per list.** This array is the single source of truth
   * for a row rendered by both Today and Insights, and `history` sits in it
   * beside `progress` and `body` — so a blanket "this card is gated" flag on the
   * card would have locked a lifter out of their own finished sessions. History
   * is the record of what they did; it is free forever, and the flag being a
   * property of each surface is what makes that structural rather than a comment.
   *
   * The gating decision itself is `isSurfaceLocked` in `src/domain/entitlements.ts`.
   * This is only which surfaces it applies to.
   */
  requiresPro: boolean;
}

/**
 * What actually makes a tile caption clip.
 *
 * Not total length: "Sessions you finished" is 21 characters and still clipped
 * to "Sessions / you finis…" on an iPhone SE, because "you finished" cannot
 * share a line at ~75pt wide. What matters is how the words pack. Calibrated
 * against the captions observed to fit on that device — "Key lifts / over time"
 * and "Recovery / by muscle" — a line holds about ten characters, and the tile
 * shows two of them.
 */
export const TILE_CAPTION_MAX_LINE_CHARS = 10;
export const TILE_CAPTION_MAX_LINES = 2;

export const DEEPER_SURFACES: readonly DeeperSurface[] = [
  {
    key: 'history',
    label: 'History',
    tileCaption: 'Finished sessions',
    rowSubtitle: 'Every session you have finished, newest first',
    icon: 'time',
    iconTone: 'violet',
    route: '/history',
    // Free forever. Logging a session and reading back what you logged are the
    // same act; charging for the second half would be charging for your own data.
    requiresPro: false,
  },
  {
    key: 'progress',
    label: 'Progress',
    tileCaption: 'Key lifts over time',
    rowSubtitle: 'Estimated 1RM and volume for your key lifts',
    icon: 'trending-up',
    iconTone: 'violet',
    route: '/(tabs)/progress',
    requiresPro: true,
  },
  {
    key: 'body',
    label: 'Body',
    tileCaption: 'Recovery by muscle',
    rowSubtitle: 'Estimated recovery for every muscle group',
    icon: 'body',
    iconTone: 'cyan',
    route: '/(tabs)/body',
    requiresPro: true,
  },
] as const;

/** Heading over the row, identical on both screens. */
export const DEEPER_SECTION = {
  eyebrow: 'More detail',
  title: 'Go deeper',
} as const;

/** The tile's glyph: the same icon as the row, in its quieter outline form. */
export function tileIcon(surface: DeeperSurface): keyof typeof Ionicons.glyphMap {
  return `${surface.icon}-outline` as keyof typeof Ionicons.glyphMap;
}
