import type { SetType } from '@/domain/types';

/**
 * HOW A SET TYPE IS NAMED
 * =======================
 * One vocabulary for the five set types, shared by everything that shows them.
 *
 * Before this, three places named them and none agreed: a `SET_TYPE_LABEL`
 * constant in `activeWorkoutStore` with no consumers at all, the logger's own
 * inline "warm-up" / "working set" strings, and a third set of labels written
 * for the History detail screen. A lifter could log a "Warm-up" and review it
 * later as a "warm-up set".
 *
 * Three forms, because the surfaces genuinely need different lengths:
 *   `mark`   one character, for the set-index cell in a five-column grid
 *   `label`  the short name, for chips and headings
 *   `spoken` what a screen reader says, which should be a phrase, not a letter
 */

export interface SetTypeCopy {
  /** Single character shown in the set-index cell. Working sets show the number. */
  mark: string;
  /** Short display name. */
  label: string;
  /** Read aloud in place of the mark, which is meaningless spoken. */
  spoken: string;
}

export const SET_TYPE_COPY: Record<SetType, SetTypeCopy> = {
  working: { mark: '', label: 'Working set', spoken: 'working set' },
  warmup: { mark: 'W', label: 'Warm-up', spoken: 'warm-up set' },
  dropset: { mark: 'D', label: 'Drop set', spoken: 'drop set' },
  failure: { mark: 'F', label: 'To failure', spoken: 'set to failure' },
  backoff: { mark: 'B', label: 'Back-off', spoken: 'back-off set' },
};

/**
 * What the index cell shows: the set's position for a working set, the type's
 * mark otherwise. Position is 1-based, matching what the logger displays.
 */
export function setTypeMark(type: SetType, position: number): string {
  return type === 'working' ? String(position) : SET_TYPE_COPY[type].mark;
}
