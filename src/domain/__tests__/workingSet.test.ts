import {
  coversLongestAnalysisWindow,
  isCompleteWorkingSet,
  KEY_LIFT_WINDOW_DAYS,
  LONGEST_ANALYSIS_WINDOW_DAYS,
  WORKING_SET_WORKOUT_LIMIT,
} from '../workingSet';

/*
  The limit is only defensible if it covers every window the app computes over.
  These assert that relationship rather than the number, so raising an analysis
  window without raising the limit fails here instead of silently truncating
  whatever that window was supposed to measure.
*/
describe('working-set bound covers the analysis windows', () => {
  it('spans the longest analysis window at realistic training frequencies', () => {
    // 1-10 sessions a week. Ten is already past what the schedule model offers.
    for (let perWeek = 1; perWeek <= 10; perWeek++) {
      expect(coversLongestAnalysisWindow(perWeek)).toBe(true);
    }
  });

  it('names Insights 12 weeks as the binding window, and contains the key-lift window', () => {
    expect(LONGEST_ANALYSIS_WINDOW_DAYS).toBe(84);
    expect(KEY_LIFT_WINDOW_DAYS).toBeLessThanOrEqual(LONGEST_ANALYSIS_WINDOW_DAYS);
  });

  it('fails when the window outgrows the limit, which is the point of the guard', () => {
    // A year-long window at four sessions a week needs ~209 sessions.
    expect(coversLongestAnalysisWindow(4, WORKING_SET_WORKOUT_LIMIT, 365)).toBe(false);
  });

  it('treats an untrained account as covered rather than dividing by zero', () => {
    expect(coversLongestAnalysisWindow(0)).toBe(true);
  });
});

describe('isCompleteWorkingSet', () => {
  it('is complete when fewer rows came back than were asked for', () => {
    expect(isCompleteWorkingSet(0)).toBe(true);
    expect(isCompleteWorkingSet(WORKING_SET_WORKOUT_LIMIT - 1)).toBe(true);
  });

  it('treats exactly the limit as incomplete', () => {
    /*
      The ambiguous case, resolved toward re-fetching. An account with exactly
      the limit is indistinguishable from one with more, and the two failure
      modes are not symmetric: one wasted query versus History silently missing
      sessions the lifter logged.
    */
    expect(isCompleteWorkingSet(WORKING_SET_WORKOUT_LIMIT)).toBe(false);
  });
});
