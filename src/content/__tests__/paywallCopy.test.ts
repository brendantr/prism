import { PAYWALL, PURCHASE_OUTCOME_COPY, paywallPurchaseLabel } from '../paywall';

function allCopy(): string {
  return [
    ...Object.values(PAYWALL).flatMap((value) => {
      if (typeof value === 'string') return [value];
      if (!Array.isArray(value)) return [];
      return value.flatMap((item) =>
        typeof item === 'string' ? [item] : [item.title, item.body],
      );
    }),
    ...Object.values(PURCHASE_OUTCOME_COPY),
  ].join(' ');
}

describe('paywall copy contract', () => {
  it('makes no diagnostic, clinical, injury-prevention or recovery promise', () => {
    expect(allCopy()).not.toMatch(
      /diagnos|clinical|medical|injur|overtrain|prevent|safer|risk[- ]free/i,
    );
  });

  it('does not expose provider or configuration vocabulary to the lifter', () => {
    expect(allCopy()).not.toMatch(
      /revenuecat|supabase|webhook|service.role|api.?key|entitlement|app\.prism\.trainer/i,
    );
  });

  it('states the free logging, History and seven-day boundary', () => {
    const free = PAYWALL.freeForever.join(' ');
    expect(free).toMatch(/logging/i);
    expect(free).toMatch(/history/i);
    expect(free).toMatch(/7-day/i);
  });

  it('has no hard-coded price and uses only the store-localized price supplied at runtime', () => {
    expect(allCopy()).not.toMatch(/[$£€]\s?\d|\d+[.,]\d{2}/);
    expect(paywallPurchaseLabel(null)).toBe(PAYWALL.purchaseLabel);
    expect(paywallPurchaseLabel('US$19.99')).toBe(`${PAYWALL.purchaseLabel} · US$19.99`);
  });
});
