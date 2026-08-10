import { getRepository, resetRepository } from '../repository';

const mockInvoke = jest.fn();
const mockRpc = jest.fn();
const mockGetSession = jest.fn(async () => ({
  data: { session: { user: { id: '11111111-1111-4111-8111-111111111111' } } },
  error: null,
}));

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('../supabase/client', () => ({
  DEMO_MODE: false,
  isSupabaseConfigured: true,
  getSupabase: () => ({
    auth: { getSession: mockGetSession },
    functions: { invoke: mockInvoke },
    rpc: mockRpc,
  }),
}));

describe('account deletion transport', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetRepository();
    mockInvoke.mockResolvedValue({ data: { ok: true }, error: null });
  });

  it('sends no caller-chosen id and delegates processor-aware deletion to the authenticated function', async () => {
    await getRepository().deleteAccount();

    expect(mockInvoke).toHaveBeenCalledWith('delete-account', { body: {} });
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('propagates a processor/function failure so local teardown cannot claim success', async () => {
    mockInvoke.mockResolvedValue({ data: null, error: new Error('deletion unavailable') });

    await expect(getRepository().deleteAccount()).rejects.toThrow('deletion unavailable');
  });
});
