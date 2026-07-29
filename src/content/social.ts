import type { Ionicons } from '@expo/vector-icons';

/**
 * SOCIAL COPY AND LOCAL PLACEHOLDER CONTENT
 * =========================================
 * Everything in this file is a static string or a hard-coded object defined on
 * the device. There is no account, no network call, no persistence, and no
 * connection to any service behind any of it.
 *
 * The sample activity below exists so the shell can be reviewed as a design.
 * Its identities are deliberately self-describing placeholders rather than
 * plausible names: a screen full of invented people reads as real data, and
 * PRism's existing position on that is already recorded in
 * `src/components/ui/PhasePanel.tsx` -- a prototype that looks like a product
 * gets mistaken for one. Every sample row is labelled on screen as well.
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
    body: 'PRism has no accounts, no friends list, and nothing behind this screen that talks to a server. Everything below is local placeholder content, on this device only. Nothing you log is shared or posted anywhere.',
  },
  plannedTitle: 'What this tab is for',
  plannedEyebrow: 'Intent',
  previewTitle: 'Your record, as a card',
  previewEyebrow: 'Layout preview',
  previewNote:
    'Built from a record you actually set. This is a layout preview of a shareable card — it is not posted, and there is nowhere for it to go yet.',
  previewEmpty:
    'Log a session and set a record, and this preview will build a card from it.',
  sampleTitle: 'What a feed would look like',
  sampleEyebrow: 'Placeholder rows',
  sampleWarning:
    'Placeholder rows with placeholder names, written to shape the layout. None of it is real activity by real people.',
  sampleBadge: 'Sample',
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

export interface SampleActivity {
  id: string;
  /** Self-describing placeholder identity. Never a plausible person's name. */
  who: string;
  handle: string;
  headline: string;
  detail: string;
  when: string;
  icon: keyof typeof Ionicons.glyphMap;
}

export const SAMPLE_ACTIVITY: SampleActivity[] = [
  {
    id: 'sample-1',
    who: 'Placeholder lifter',
    handle: '@sample-01',
    headline: 'Kept a 4-week streak',
    detail: 'Four sessions a week, four weeks running.',
    when: 'Earlier today',
    icon: 'flame-outline',
  },
  {
    id: 'sample-2',
    who: 'Placeholder lifter',
    handle: '@sample-02',
    headline: 'New estimated 1RM on a main lift',
    detail: 'Shared the card, not the session.',
    when: 'Yesterday',
    icon: 'trending-up-outline',
  },
  {
    id: 'sample-3',
    who: 'Placeholder lifter',
    handle: '@sample-03',
    headline: 'Finished a four-week agreement',
    detail: 'Both people hit every session they committed to.',
    when: '3 days ago',
    icon: 'flag-outline',
  },
];
