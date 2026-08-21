import type { Ionicons } from '@expo/vector-icons';

/**
 * SOCIAL COPY
 * ===========
 * Every value here is a static string defined on the device. There is no
 * account, no network call, no persistence, and no connection to any service
 * behind any of it.
 *
 * **No placeholder activity.** A first draft of this module carried a sample
 * feed -- invented rows with self-describing placeholder identities, badged and
 * captioned -- so the shell could be reviewed as a design. It was cut (owner
 * decision, 2026-07-29). Rows depicting things that did not happen read as real
 * activity regardless of the label, which is the position PRism already took in
 * `src/components/ui/PhasePanel.tsx`, and the record card preview on the screen
 * is built from the lifter's own data and covers the same design ground.
 *
 * Whether PRism ships a social surface at all is an open product question --
 * see `Docs/research/R-001-primary-surface-information-architecture.md` open
 * question 1. This tab holds the navigation slot; it does not settle that.
 */

export const SOCIAL = {
  eyebrow: 'Not connected yet',
  title: 'Training with others',
  notice: {
    title: 'Nothing on this tab is live',
    body: 'Repello has no accounts, no friends list, and nothing behind this screen that talks to a server. Everything below is local placeholder content, on this device only. Nothing you log is shared or posted anywhere.',
  },
  plannedTitle: 'What this tab is for',
  plannedEyebrow: 'Intent',
  previewTitle: 'Your record, as a card',
  previewEyebrow: 'Layout preview',
  previewNote:
    'Built from a record you actually set. This is a layout preview of a shareable card — it is not posted, and there is nowhere for it to go yet.',
  previewEmpty:
    'Log a session and set a record, and this preview will build a card from it.',
} as const;

export interface PlannedSurface {
  id: string;
  title: string;
  body: string;
  icon: keyof typeof Ionicons.glyphMap;
}

/**
 * The three jobs a social surface would do, stated concretely enough to argue
 * with. Not a feature list -- a description of what would earn the slot.
 */
export const PLANNED_SURFACES: PlannedSurface[] = [
  {
    id: 'accountability',
    title: 'A short list, not a following count',
    body: 'A handful of people whose consistency you actually see. Sessions logged and weeks kept, not likes.',
    icon: 'people-outline',
  },
  {
    id: 'records',
    title: 'Records you choose to share',
    body: 'A record stays private until you send it. Nothing about readiness, check-ins, or bodyweight is ever shareable.',
    icon: 'lock-closed-outline',
  },
  {
    id: 'challenges',
    title: 'Agreements, not leaderboards',
    body: 'Two people committing to four sessions a week for a month. Ranking strangers by volume rewards the wrong thing.',
    icon: 'flag-outline',
  },
];
