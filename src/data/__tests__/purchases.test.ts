const mockSdk = {
  configure: jest.fn(),
  logIn: jest.fn(async () => ({})),
  getOfferings: jest.fn(),
  purchasePackage: jest.fn(async () => ({})),
  restorePurchases: jest.fn(),
};

jest.mock('@/data/supabase/client', () => ({ DEMO_MODE: false, isSupabaseConfigured: true }));

describe('purchase transport', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.EXPO_PUBLIC_DEMO_MODE = 'false';
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'public-test-value';
    process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY = 'public-ios-test-value';
    process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY = 'public-android-test-value';
    jest.resetModules();
  });

  it('configures RevenueCat with the opaque Supabase UUID as its custom id', async () => {
    const { configurePurchases } = require('../purchases') as typeof import('../purchases');
    const { __setPurchasesSdkForTests } = require('../purchases') as typeof import('../purchases');
    __setPurchasesSdkForTests(mockSdk as never);
    const userId = '11111111-1111-4111-8111-111111111111';

    await configurePurchases(userId);

    expect(mockSdk.configure).toHaveBeenCalledWith(
      expect.objectContaining({ appUserID: userId }),
    );
  });

  it('purchases only the exact lifetime product, never the first remote package', async () => {
    const other = { product: { identifier: 'another.product', priceString: '$1.00' } };
    const lifetime = {
      product: { identifier: 'app.prism.trainer.pro.lifetime', priceString: '$19.99' },
    };
    mockSdk.getOfferings.mockResolvedValue({ current: { availablePackages: [other, lifetime] } });
    const { purchasePro, __setPurchasesSdkForTests } = require('../purchases') as typeof import('../purchases');
    __setPurchasesSdkForTests(mockSdk as never);

    await purchasePro();

    expect(mockSdk.purchasePackage).toHaveBeenCalledWith(lifetime);
    expect(mockSdk.purchasePackage).not.toHaveBeenCalledWith(other);
  });

  it('fails before opening a store sheet when the exact product is absent', async () => {
    const other = { product: { identifier: 'another.product', priceString: '$1.00' } };
    mockSdk.getOfferings.mockResolvedValue({ current: { availablePackages: [other] } });
    const { purchasePro, __setPurchasesSdkForTests } = require('../purchases') as typeof import('../purchases');
    __setPurchasesSdkForTests(mockSdk as never);

    await expect(purchasePro()).rejects.toMatchObject({ code: 'store_problem' });
    expect(mockSdk.purchasePackage).not.toHaveBeenCalled();
  });
});
