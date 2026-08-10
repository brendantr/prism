import { KEY_LIFTS_COPY, ZERO_DATA, type ZeroDataState } from '../zeroData';
import { KEY_LIFT_MIN_SESSIONS, KEY_LIFT_WINDOW_WEEKS } from '@/domain/calc/keyLifts';

/**
 * Copy as policy, same posture as `authCopy.test.ts` and `accountCopy.test.ts`.
 *
 * These are the sentences a brand-new account reads on three screens that
 * previously either lied to it or said nothing at all. They are the most likely
 * place for a well-meaning reassurance to creep in later, which is exactly the
 * thing I-18 exists to stop.
 */

const STATES: Array<[string, ZeroDataState]> = Object.entries(ZERO_DATA);

const ALL_COPY = [
  ...STATES.flatMap(([, s]) => [s.title, s.body, s.actionLabel]),
  KEY_LIFTS_COPY.sectionTitle,
  KEY_LIFTS_COPY.sectionEyebrow,
  KEY_LIFTS_COPY.emptyTitle,
  KEY_LIFTS_COPY.emptyBody,
].join(' ');

describe('zero-data copy', () => {
  it('makes no medical, diagnostic, or clinical claim', () => {
    // I-8. The Body state is the one that has to resist this: it is about
    // recovery, and "you are fully recovered" is one adjective away.
    expect(ALL_COPY).not.toMatch(/diagnos|clinical|medical|injur|overtrain|prevent/i);
  });

  it('names no environment variable, credential, or internal identifier', () => {
    // I-4/I-5.
    expect(ALL_COPY).not.toMatch(/EXPO_PUBLIC_/);
    expect(ALL_COPY).not.toMatch(/SUPABASE|supabase/);
    expect(ALL_COPY).not.toMatch(/ANON_KEY|SERVICE_ROLE|API_KEY|SECRET|TOKEN/);
    expect(ALL_COPY).not.toMatch(/\bRLS\b|profile_id|exercise_id|uuid|postgres|e1rmSeries/i);
  });

  it('covers all three screens that can load with nothing in them', () => {
    expect(STATES.map(([screen]) => screen).sort()).toEqual(['body', 'insights', 'progress']);
  });

  it.each(STATES)('the %s state offers a way out', (_screen, state) => {
    // `EmptyState`'s own contract: "an empty state without one is a dead end."
    // Progress's fallback used to be a bare title with neither body nor action.
    expect(state.title.trim().length).toBeGreaterThan(0);
    expect(state.body.trim().length).toBeGreaterThan(0);
    expect(state.actionLabel.trim().length).toBeGreaterThan(0);
    expect(state.route).toBe('/workout/templates');
  });

  it.each(STATES)('the %s state states the absence rather than a result', (_screen, state) => {
    /*
      I-18, as far as a regex can carry it. Each of these has to read as "there
      is nothing here yet", never as a finding.
    */
    expect(`${state.title} ${state.body}`).toMatch(/yet|nothing|no /i);
  });

  it.each(STATES)('the %s state says what would fill it', (_screen, state) => {
    // The difference between an honest empty state and a shrug: each body
    // sentence names logged training as the thing that is missing.
    expect(state.body).toMatch(/session|logged|training/i);
  });

  it('never turns Body’s empty screen into a verdict', () => {
    /*
      The banned phrases are the ones that would make an absence read as a
      finding -- which is precisely what sixteen muscle rows at 100% "fresh"
      were saying on that screen before this sprint.
    */
    const bodyCopy = `${ZERO_DATA.body.title} ${ZERO_DATA.body.body}`;
    expect(bodyCopy).not.toMatch(/fully recovered|all clear|you are (fresh|ready|recovered)/i);
    expect(bodyCopy).not.toMatch(/100%|\bfresh\b/i);
  });

  it('keeps Body describing an estimate rather than a measurement', () => {
    // The header eyebrow on that screen is "Estimate, not measurement", and
    // this is the copy most able to contradict it.
    expect(ZERO_DATA.body.body).toMatch(/estimate/i);
    expect(ZERO_DATA.body.body).not.toMatch(/measure|monitor|track your recovery/i);
  });

  it('quotes the key-lift window from the constants that define it', () => {
    /*
      The heading this replaces was a hard-coded "Estimated 1RM, 8 weeks" sitting
      above a series computed over the entire history. Interpolating means the
      copy cannot outlive the window it describes.
    */
    expect(KEY_LIFTS_COPY.sectionEyebrow).toContain(String(KEY_LIFT_WINDOW_WEEKS));
    expect(KEY_LIFTS_COPY.emptyBody).toContain(String(KEY_LIFT_WINDOW_WEEKS));
    expect(KEY_LIFTS_COPY.emptyBody).toContain(String(KEY_LIFT_MIN_SESSIONS));
  });

  it('explains the key-lifts panel without naming a lift PRism did not pick', () => {
    // The whole defect was a fixed list of four movements. A sentence promising
    // "squat, bench, deadlift" would reintroduce it in words after it was
    // removed from the code.
    expect(KEY_LIFTS_COPY.emptyBody).not.toMatch(/squat|bench|deadlift|pull-?up/i);
  });
});
