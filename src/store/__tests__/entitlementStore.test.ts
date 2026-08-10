import { PRO_ENTITLEMENT_ID, PRO_PRODUCT_ID, type EntitlementRecord } from '@/domain/entitlements';
import {
  __resetEntitlementSubscriptionForTests,
  useEntitlementStore,
} from '../entitlementStore';

jest.mock('@/data/purchases', () => ({
  configurePurchases: jest.fn(async () => undefined),
  detachDeletedPurchaseUser: jest.fn(async () => undefined),
  getProPriceString: jest.fn(async () => '$19.99'),
  identifyPurchaseUser: jest.fn(async () => undefined),
  isEntitlementBackendEnabled: jest.fn(() => true),
  isEntitlementDisabled: jest.fn(() => false),
  isPurchaseTransportEnabled: jest.fn(() => true),
  purchasePro: jest.fn(async () => undefined),
  restorePurchases: jest.fn(async () => true),
}));

jest.mock('@/data/repository', () => ({
  getRepository: jest.fn(),
}));

const purchases = jest.requireMock('@/data/purchases') as Record<string, jest.Mock>;
const { getRepository } = jest.requireMock('@/data/repository') as { getRepository: jest.Mock };

const grant: EntitlementRecord = {
  entitlementId: PRO_ENTITLEMENT_ID,
  productId: PRO_PRODUCT_ID,
  grantedAt: '2026-08-09T12:00:00.000Z',
  revokedAt: null,
  source: 'revenuecat',
};

let getEntitlement: jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  __resetEntitlementSubscriptionForTests();
  getEntitlement = jest.fn(async () => null);
  getRepository.mockReturnValue({ getEntitlement });
  purchases.isEntitlementBackendEnabled.mockReturnValue(true);
  purchases.isEntitlementDisabled.mockReturnValue(false);
  purchases.isPurchaseTransportEnabled.mockReturnValue(true);
  purchases.getProPriceString.mockResolvedValue('$19.99');
  purchases.restorePurchases.mockResolvedValue(true);
  useEntitlementStore.setState({
    phase: 'unknown',
    purchaseReady: false,
    priceString: null,
    pending: null,
    lastFailure: null,
    lastSuccess: null,
  });
});

describe('initialize', () => {
  it('moves to entitled only from the Postgres answer', async () => {
    getEntitlement.mockResolvedValue(grant);

    await useEntitlementStore.getState().initialize('11111111-1111-4111-8111-111111111111');

    expect(useEntitlementStore.getState()).toMatchObject({
      phase: 'entitled',
      purchaseReady: true,
      priceString: '$19.99',
    });
  });

  it('still reads server truth when the public RevenueCat key is absent', async () => {
    purchases.isPurchaseTransportEnabled.mockReturnValue(false);
    getEntitlement.mockResolvedValue(grant);

    await useEntitlementStore.getState().initialize('11111111-1111-4111-8111-111111111111');

    expect(getEntitlement).toHaveBeenCalledTimes(1);
    expect(useEntitlementStore.getState().phase).toBe('entitled');
    expect(useEntitlementStore.getState().purchaseReady).toBe(false);
    expect(purchases.configurePurchases).not.toHaveBeenCalled();
  });

  it('unlocks without constructing clients only in explicit demo mode', async () => {
    purchases.isEntitlementDisabled.mockReturnValue(true);

    await useEntitlementStore.getState().initialize(null);

    expect(useEntitlementStore.getState().phase).toBe('disabled');
    expect(getRepository).not.toHaveBeenCalled();
    expect(purchases.configurePurchases).not.toHaveBeenCalled();
  });

  it('stays unknown and locked when the real backend is misconfigured', async () => {
    purchases.isEntitlementBackendEnabled.mockReturnValue(false);

    await useEntitlementStore.getState().initialize(null);

    expect(useEntitlementStore.getState().phase).toBe('unknown');
    expect(getRepository).not.toHaveBeenCalled();
  });

  it('does not downgrade or upgrade on a failed server read', async () => {
    getEntitlement.mockRejectedValue(new Error('schema detail'));
    await useEntitlementStore.getState().initialize('11111111-1111-4111-8111-111111111111');
    expect(useEntitlementStore.getState().phase).toBe('unknown');

    useEntitlementStore.setState({ phase: 'entitled' });
    await useEntitlementStore.getState().refresh();
    expect(useEntitlementStore.getState().phase).toBe('entitled');
  });
});

describe('purchase and restore', () => {
  it('never grants from a successful purchase SDK response', async () => {
    await useEntitlementStore.getState().initialize('11111111-1111-4111-8111-111111111111');

    await expect(
      useEntitlementStore.getState().purchase({ pollDelaysMs: [0] }),
    ).resolves.toBe(false);

    expect(purchases.purchasePro).toHaveBeenCalledTimes(1);
    expect(useEntitlementStore.getState()).toMatchObject({
      phase: 'notEntitled',
      lastFailure: 'awaitingServer',
      lastSuccess: null,
    });
  });

  it('unlocks after purchase only when a later server poll returns the row', async () => {
    getEntitlement.mockResolvedValueOnce(null).mockResolvedValueOnce(grant);
    await useEntitlementStore.getState().initialize('11111111-1111-4111-8111-111111111111');

    await expect(
      useEntitlementStore.getState().purchase({ pollDelaysMs: [0] }),
    ).resolves.toBe(true);

    expect(useEntitlementStore.getState()).toMatchObject({
      phase: 'entitled',
      lastFailure: null,
      lastSuccess: 'purchased',
    });
  });

  it('never grants from restore CustomerInfo alone', async () => {
    await useEntitlementStore.getState().initialize('11111111-1111-4111-8111-111111111111');

    await expect(
      useEntitlementStore.getState().restore({ pollDelaysMs: [0] }),
    ).resolves.toBe(false);

    expect(useEntitlementStore.getState().phase).toBe('notEntitled');
    expect(useEntitlementStore.getState().lastFailure).toBe('awaitingServer');
  });

  it('does not call the store when purchase transport was not configured', async () => {
    purchases.isPurchaseTransportEnabled.mockReturnValue(false);
    await useEntitlementStore.getState().initialize('11111111-1111-4111-8111-111111111111');

    await expect(useEntitlementStore.getState().purchase()).resolves.toBe(false);
    expect(purchases.purchasePro).not.toHaveBeenCalled();
    expect(useEntitlementStore.getState().lastFailure).toBe('storeUnavailable');
  });

  it('does not open a purchase sheet when the exact Offering product has no price', async () => {
    purchases.getProPriceString.mockResolvedValue(null);
    await useEntitlementStore.getState().initialize('11111111-1111-4111-8111-111111111111');

    await expect(useEntitlementStore.getState().purchase()).resolves.toBe(false);
    expect(purchases.purchasePro).not.toHaveBeenCalled();
    expect(useEntitlementStore.getState().lastFailure).toBe('storeUnavailable');
  });
});

describe('identity and teardown', () => {
  it('never carries A entitlement into a direct B session transition', async () => {
    const userA = '11111111-1111-4111-8111-111111111111';
    const userB = '22222222-2222-4222-8222-222222222222';
    getEntitlement.mockResolvedValueOnce(grant).mockResolvedValueOnce(null);

    await useEntitlementStore.getState().initialize(userA);
    expect(useEntitlementStore.getState().phase).toBe('entitled');

    // No explicit reset: this is the auth-listener/direct-switch failure mode.
    await useEntitlementStore.getState().initialize(userB);

    expect(purchases.identifyPurchaseUser).toHaveBeenCalledWith(userB);
    expect(useEntitlementStore.getState().phase).toBe('notEntitled');
  });

  it('never logs out to an anonymous RevenueCat id and logs a different custom id in directly', async () => {
    const userA = '11111111-1111-4111-8111-111111111111';
    const userB = '22222222-2222-4222-8222-222222222222';
    await useEntitlementStore.getState().initialize(userA);
    await useEntitlementStore.getState().reset();
    await useEntitlementStore.getState().initialize(userB);

    expect(purchases.configurePurchases).toHaveBeenCalledWith(userA);
    expect(purchases.identifyPurchaseUser).toHaveBeenCalledWith(userB);
    expect('signOutOfPurchases' in purchases).toBe(false);
  });

  it('detaches the SDK identity only after permanent account deletion', async () => {
    const userA = '11111111-1111-4111-8111-111111111111';
    await useEntitlementStore.getState().initialize(userA);

    await useEntitlementStore.getState().reset();
    expect(purchases.detachDeletedPurchaseUser).not.toHaveBeenCalled();

    await useEntitlementStore.getState().initialize(userA);
    await useEntitlementStore.getState().resetAfterAccountDeletion();
    expect(purchases.detachDeletedPurchaseUser).toHaveBeenCalledTimes(1);
    expect(useEntitlementStore.getState().phase).toBe('unknown');
  });

  it('forgets all account-specific access before the next route can render', async () => {
    useEntitlementStore.setState({
      phase: 'entitled',
      purchaseReady: true,
      priceString: '$19.99',
      lastSuccess: 'purchased',
    });

    await useEntitlementStore.getState().reset();

    expect(useEntitlementStore.getState()).toMatchObject({
      phase: 'unknown',
      purchaseReady: false,
      priceString: null,
      pending: null,
      lastFailure: null,
      lastSuccess: null,
    });
  });
});
