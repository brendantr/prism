import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import type { Equipment, Experience, Goal } from '@/domain/types';

/**
 * Onboarding state: whether the flow has been completed, and what was chosen.
 *
 * Kept separate from `trainingStore` on purpose. This is first-run navigation
 * state, not training data, and the two have no reason to reload together.
 *
 * The selections are recorded but NOT yet applied to the user's profile --
 * wiring them through `trainingStore.updateProfile` would change data the rest
 * of the app already reads, which is outside this sprint's scope. They are
 * persisted so a follow-up can apply them without asking the user again.
 */

const STORAGE_KEY = 'prism.onboarding.v1';

export interface OnboardingSelections {
  goal: Goal | null;
  experience: Experience | null;
  trainingDaysPerWeek: number | null;
  availableEquipment: Equipment[];
}

interface OnboardingState extends OnboardingSelections {
  /** `unknown` until the persisted flag has been read. */
  status: 'unknown' | 'ready';
  completed: boolean;

  load: () => Promise<void>;
  select: (patch: Partial<OnboardingSelections>) => void;
  toggleEquipment: (equipment: Equipment) => void;
  complete: () => Promise<void>;
  /** Replays the flow on next launch. Used by the dev affordance in Settings. */
  reset: () => Promise<void>;
}

const EMPTY: OnboardingSelections = {
  goal: null,
  experience: null,
  trainingDaysPerWeek: null,
  availableEquipment: [],
};

export const useOnboardingStore = create<OnboardingState>((set, get) => ({
  ...EMPTY,
  status: 'unknown',
  completed: false,

  load: async () => {
    if (get().status === 'ready') return;
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      const saved = raw ? (JSON.parse(raw) as Partial<OnboardingState>) : null;
      set({
        status: 'ready',
        completed: saved?.completed === true,
        goal: saved?.goal ?? null,
        experience: saved?.experience ?? null,
        trainingDaysPerWeek: saved?.trainingDaysPerWeek ?? null,
        availableEquipment: saved?.availableEquipment ?? [],
      });
    } catch {
      // A corrupt flag must never wedge the app on a blank screen. Treat it as
      // "not onboarded" and let the user walk through the flow again.
      set({ status: 'ready', completed: false, ...EMPTY });
    }
  },

  select: (patch) => set(patch),

  toggleEquipment: (equipment) =>
    set((s) => ({
      availableEquipment: s.availableEquipment.includes(equipment)
        ? s.availableEquipment.filter((e) => e !== equipment)
        : [...s.availableEquipment, equipment],
    })),

  complete: async () => {
    set({ completed: true });
    await persist(get());
  },

  reset: async () => {
    set({ completed: false, ...EMPTY });
    await AsyncStorage.removeItem(STORAGE_KEY);
  },
}));

async function persist(s: OnboardingState): Promise<void> {
  const payload: OnboardingSelections & { completed: boolean } = {
    completed: s.completed,
    goal: s.goal,
    experience: s.experience,
    trainingDaysPerWeek: s.trainingDaysPerWeek,
    availableEquipment: s.availableEquipment,
  };
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}
