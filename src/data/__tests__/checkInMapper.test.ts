import { toCheckIn } from '../supabase/mappers';

describe('toCheckIn', () => {
  it('keeps the local calendar date separate from the event timestamp', () => {
    expect(
      toCheckIn({
        id: 'ci_1',
        profile_id: 'p1',
        local_date: '2026-03-02',
        checked_in_at: '2026-03-03T03:30:00.000Z',
        sleep_quality: 4,
        energy: null,
        soreness: 2,
        stress: null,
      }),
    ).toEqual({
      id: 'ci_1',
      profileId: 'p1',
      localDate: '2026-03-02',
      checkedInAt: '2026-03-03T03:30:00.000Z',
      sleepQuality: 4,
      energy: null,
      soreness: 2,
      stress: null,
    });
  });
});
