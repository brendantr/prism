import AsyncStorage from '@react-native-async-storage/async-storage';
import { useOnboardingStore } from '../onboardingStore';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const STORAGE_KEY = 'prism.onboarding.v1';

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  useOnboardingStore.setState({
    status: 'ready',
    completed: false,
    goal: 'strength',
    experience: null,
    trainingDaysPerWeek: 3,
    availableEquipment: ['barbell'],
  });
});

describe('onboarding completion durability', () => {
  it('persists the answers before exposing the completed state', async () => {
    let completedWhenStorageRan: boolean | null = null;
    (AsyncStorage.setItem as jest.Mock).mockImplementationOnce(async () => {
      completedWhenStorageRan = useOnboardingStore.getState().completed;
    });

    await useOnboardingStore.getState().complete();

    expect(completedWhenStorageRan).toBe(false);
    expect(useOnboardingStore.getState().completed).toBe(true);
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      STORAGE_KEY,
      JSON.stringify({
        completed: true,
        goal: 'strength',
        experience: null,
        trainingDaysPerWeek: 3,
        availableEquipment: ['barbell'],
      }),
    );
  });

  it('keeps the gate closed when persistence fails', async () => {
    (AsyncStorage.setItem as jest.Mock).mockRejectedValueOnce(new Error('storage unavailable'));

    await expect(useOnboardingStore.getState().complete()).rejects.toThrow('storage unavailable');

    expect(useOnboardingStore.getState().completed).toBe(false);
  });
});
