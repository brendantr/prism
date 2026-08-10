import {
  COMPLETE,
  completionBody,
  FEATURE_SLIDES,
  FEATURES,
  ONBOARDING_LOG_DEMO,
  ONBOARDING_PROGRESS_DEMO,
  ONBOARDING_READINESS_DEMO,
} from '../onboarding';
import { estimateOneRepMax } from '@/domain/calc/oneRepMax';

/**
 * These are data/content invariant tests, not component/rendering tests --
 * this repo has no component-test tooling installed
 * (`Docs/sprints/2026-08-01-onboarding-ui-redesign.md` explains why one is
 * not added here). What is testable with the existing hermetic Jest setup,
 * and what actually matters for honesty, is that the onboarding redesign's
 * demo numbers are real outputs of the real formula rather than typed
 * separately and left to drift.
 */
describe('onboarding redesign content', () => {
  describe('FEATURE_SLIDES', () => {
    it('has exactly the three slides, in the log -> progress -> readiness order the carousel assumes', () => {
      expect(FEATURE_SLIDES.map((s) => s.id)).toEqual(['log', 'progress', 'readiness']);
    });

    it('gives every slide a numbered "NN / SECTION" eyebrow', () => {
      for (const slide of FEATURE_SLIDES) {
        expect(slide.eyebrow).toMatch(/^\d{2} \/ [A-Z]+$/);
      }
    });

    it('gives every slide a non-empty headline and body', () => {
      for (const slide of FEATURE_SLIDES) {
        expect(slide.title.length).toBeGreaterThan(0);
        expect(slide.body.length).toBeGreaterThan(0);
      }
    });
  });

  describe('FEATURES CTA labels', () => {
    it('uses "Continue" for every slide except the last, and "Get started" for the last', () => {
      expect(FEATURES.primaryCta).toBe('Continue');
      expect(FEATURES.finalCta).toBe('Get started');
    });
  });

  describe('ONBOARDING_LOG_DEMO', () => {
    it('matches the sprint spec: Back Squat, 3 sets of 100 kg x 5, RPE 8', () => {
      expect(ONBOARDING_LOG_DEMO.exerciseName).toBe('Back Squat');
      expect(ONBOARDING_LOG_DEMO.sets).toHaveLength(3);
      for (const set of ONBOARDING_LOG_DEMO.sets) {
        expect(set).toEqual({ weightKg: 100, reps: 5, rpe: 8 });
      }
    });
  });

  describe('ONBOARDING_PROGRESS_DEMO', () => {
    const samples = ONBOARDING_PROGRESS_DEMO.weeklySamples;

    it('has 8 weekly samples', () => {
      expect(samples).toHaveLength(8);
    });

    it('produces a monotonically increasing estimated-1RM trend through the real Epley formula', () => {
      const e1rms = samples.map((s) => estimateOneRepMax(s.weightKg, s.reps));
      for (let i = 1; i < e1rms.length; i++) {
        expect(e1rms[i]).toBeGreaterThan(e1rms[i - 1]);
      }
    });

    it("its final sample is the same lift and load as the Log slide's preview, for a coherent story", () => {
      const final = samples[samples.length - 1];
      const logSet = ONBOARDING_LOG_DEMO.sets[0];
      expect(final.weightKg).toBe(logSet.weightKg);
      expect(final.reps).toBe(logSet.reps);
    });

    it('matches the exact figures recorded in the sprint doc', () => {
      const expected = [102.7, 105.0, 106.2, 108.0, 109.7, 112.0, 114.0, 116.7];
      const actual = samples.map((s) => Math.round(estimateOneRepMax(s.weightKg, s.reps) * 10) / 10);
      expect(actual).toEqual(expected);
    });
  });

  describe('ONBOARDING_READINESS_DEMO', () => {
    it('has recent training, sleep, and recovery rows, in that order', () => {
      expect(ONBOARDING_READINESS_DEMO.rows.map((r) => r.key)).toEqual(['training', 'sleep', 'recovery']);
    });

    it('only recent training has input; sleep and recovery do not', () => {
      const [training, sleep, recovery] = ONBOARDING_READINESS_DEMO.rows;
      expect(training.hasInput).toBe(true);
      expect(sleep.hasInput).toBe(false);
      expect(recovery.hasInput).toBe(false);
    });

    it('explicitly denies being a diagnosis or medical advice', () => {
      const { disclaimer } = ONBOARDING_READINESS_DEMO;
      expect(disclaimer).toContain('never a diagnosis');
      expect(disclaimer).toContain('never medical advice');
    });
  });
  /**
   * THE COMPLETION SENTENCE
   * =======================
   * One string used to promise eight weeks of sample training and storage "on
   * this device". Both halves are true in demo and both are false on a real
   * account, and it is the last screen before Today -- every tester would have
   * read it. Found by a cold-start run against a live project, 2026-08-08.
   *
   * These assertions hold each variant to what its own mode can deliver, so the
   * two cannot be collapsed back into one by someone tidying up.
   */
  describe('COMPLETE, per mode', () => {
    it('gives an account build the account sentence, and demo the demo one', () => {
      expect(completionBody(true)).toBe(COMPLETE.bodyAccount);
      expect(completionBody(false)).toBe(COMPLETE.bodyDemo);
    });

    it('never tells a real account its data is device-bound or pre-populated', () => {
      const body = COMPLETE.bodyAccount.toLowerCase();
      for (const claim of ['this device', 'sample training', 'eight weeks']) {
        expect(body).not.toContain(claim);
      }
    });

    it('tells a real account both true things: it starts empty, and it persists', () => {
      const body = COMPLETE.bodyAccount.toLowerCase();
      expect(body).toContain('empty');
      expect(body).toContain('saves');
    });

    it('never promises a demo build an account', () => {
      // The inverse error: demo data is device-only, and saying otherwise would
      // send someone looking for sessions that were never uploaded anywhere.
      const body = COMPLETE.bodyDemo.toLowerCase();
      expect(body).toContain('this device');
      expect(body).not.toContain('sign in');
    });

    it('says the answers become editable profile settings', () => {
      const note = COMPLETE.summaryNote.toLowerCase();
      expect(note).toContain('starting profile');
      expect(note).toContain('settings');
      expect(note).toContain('skipped');
    });
  });
});
