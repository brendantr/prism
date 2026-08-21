import {
  PRO_ENTITLEMENT_ID,
  PRO_PRODUCT_ID,
  canRenderPaywall,
  isInsightsWindowLocked,
  isSurfaceLocked,
  resolveEntitlementPhase,
  resolveInsightsWindow,
  toPurchaseFailure,
  type EntitlementRecord,
} from '../entitlements';

const record = (overrides: Partial<EntitlementRecord> = {}): EntitlementRecord => ({
  entitlementId: PRO_ENTITLEMENT_ID,
  productId: PRO_PRODUCT_ID,
  grantedAt: '2026-08-09T12:00:00.000Z',
  revokedAt: null,
  source: 'revenuecat',
  ...overrides,
});

describe('server entitlement resolution', () => {
  it('requires the exact server product and entitlement contract', () => {
    expect(resolveEntitlementPhase(record())).toBe('entitled');
    expect(resolveEntitlementPhase(record({ entitlementId: 'another' }))).toBe('notEntitled');
    expect(resolveEntitlementPhase(record({ productId: 'another.product' }))).toBe('notEntitled');
    expect(resolveEntitlementPhase(null)).toBe('notEntitled');
  });

  it('keeps a refunded record but resolves it as not entitled', () => {
    expect(resolveEntitlementPhase(record({ revokedAt: '2026-08-10T12:00:00.000Z' }))).toBe(
      'notEntitled',
    );
  });
});

describe('surface gating', () => {
  it('never locks a free surface', () => {
    expect(isSurfaceLocked({ requiresPro: false, phase: 'unknown' })).toBe(false);
    expect(isSurfaceLocked({ requiresPro: false, phase: 'notEntitled' })).toBe(false);
  });

  it('fails paid surfaces closed until the server confirms access', () => {
    expect(isSurfaceLocked({ requiresPro: true, phase: 'unknown' })).toBe(true);
    expect(isSurfaceLocked({ requiresPro: true, phase: 'notEntitled' })).toBe(true);
    expect(isSurfaceLocked({ requiresPro: true, phase: 'entitled' })).toBe(false);
    expect(isSurfaceLocked({ requiresPro: true, phase: 'disabled' })).toBe(false);
  });

  it('keeps seven-day Insights free and falls locked selections back to it', () => {
    expect(isInsightsWindowLocked(7, 'unknown')).toBe(false);
    expect(isInsightsWindowLocked(28, 'notEntitled')).toBe(true);
    expect(isInsightsWindowLocked(84, 'entitled')).toBe(false);
    expect(resolveInsightsWindow(28, 'notEntitled')).toBe(7);
    expect(resolveInsightsWindow(84, 'entitled')).toBe(84);
  });

  it('makes the paywall route unreachable when monetization is disabled', () => {
    expect(canRenderPaywall('disabled')).toBe(false);
    expect(canRenderPaywall('unknown')).toBe(true);
    expect(canRenderPaywall('notEntitled')).toBe(true);
    expect(canRenderPaywall('entitled')).toBe(true);
  });
});

describe('purchase failure boundary', () => {
  it('maps known store failures and never passes through provider messages', () => {
    expect(toPurchaseFailure({ userCancelled: true, message: 'receipt detail' })).toBe('cancelled');
    expect(toPurchaseFailure({ code: 'NETWORK_ERROR' })).toBe('network');
    expect(toPurchaseFailure({ code: 'STORE_PROBLEM' })).toBe('storeUnavailable');
    expect(toPurchaseFailure({ code: 'PURCHASE_NOT_ALLOWED_ERROR' })).toBe('notAllowed');
    expect(toPurchaseFailure({ message: 'private provider detail' })).toBe('unknown');
  });
});
