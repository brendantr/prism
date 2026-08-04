import { SET_TYPE_COPY, setTypeMark } from '../setTypes';
import type { SetType } from '@/domain/types';

const ALL_TYPES: SetType[] = ['working', 'warmup', 'dropset', 'failure', 'backoff'];

/**
 * Content-invariant tests. The property worth pinning is that this stays the
 * only vocabulary: a sixth set type added to the domain union without copy
 * here, or a mark long enough to break the index cell, fails.
 */
describe('set type copy', () => {
  it('covers every set type in the domain union', () => {
    for (const type of ALL_TYPES) {
      expect(SET_TYPE_COPY[type]).toBeDefined();
    }
    expect(Object.keys(SET_TYPE_COPY).sort()).toEqual([...ALL_TYPES].sort());
  });

  it('gives every non-working type a single-character mark', () => {
    for (const type of ALL_TYPES) {
      if (type === 'working') continue;
      expect(SET_TYPE_COPY[type].mark).toHaveLength(1);
    }
  });

  it('leaves the working mark empty, because a working set shows its number', () => {
    expect(SET_TYPE_COPY.working.mark).toBe('');
  });

  it('gives every type a spoken form longer than its mark', () => {
    // A screen reader announcing "W" has told the lifter nothing.
    for (const type of ALL_TYPES) {
      expect(SET_TYPE_COPY[type].spoken.length).toBeGreaterThan(
        SET_TYPE_COPY[type].mark.length,
      );
    }
  });

  describe('setTypeMark', () => {
    it('shows the position for a working set', () => {
      expect(setTypeMark('working', 1)).toBe('1');
      expect(setTypeMark('working', 12)).toBe('12');
    });

    it('shows the type mark for everything else, whatever the position', () => {
      expect(setTypeMark('warmup', 1)).toBe('W');
      expect(setTypeMark('dropset', 4)).toBe('D');
      expect(setTypeMark('failure', 7)).toBe('F');
      expect(setTypeMark('backoff', 2)).toBe('B');
    });
  });
});
