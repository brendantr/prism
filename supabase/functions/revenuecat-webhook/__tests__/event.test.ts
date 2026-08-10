import {
  PRO_ENTITLEMENT_ID as CLIENT_ENTITLEMENT_ID,
  PRO_PRODUCT_ID as CLIENT_PRODUCT_ID,
} from '../../../../src/domain/entitlements';
import {
  PRO_ENTITLEMENT_ID,
  PRO_PRODUCT_ID,
  parseRevenueCatEvent,
} from '../event';

const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';

function payload(overrides: Record<string, unknown> = {}) {
  return {
    api_version: '1.0',
    event: {
      id: 'event-1',
      type: 'NON_RENEWING_PURCHASE',
      event_timestamp_ms: 1_786_269_600_000,
      app_user_id: USER_A,
      original_app_user_id: USER_A,
      aliases: [USER_A],
      product_id: PRO_PRODUCT_ID,
      entitlement_ids: [PRO_ENTITLEMENT_ID],
      ...overrides,
    },
  };
}

describe('RevenueCat event contract', () => {
  it('cannot drift from the product and entitlement compiled into the client', () => {
    expect(PRO_PRODUCT_ID).toBe(CLIENT_PRODUCT_ID);
    expect(PRO_ENTITLEMENT_ID).toBe(CLIENT_ENTITLEMENT_ID);
  });

  it('maps the lifetime non-renewing purchase to one server grant', () => {
    expect(parseRevenueCatEvent(payload())).toEqual({
      kind: 'apply',
      eventId: 'event-1',
      eventType: 'NON_RENEWING_PURCHASE',
      eventTimestampMs: 1_786_269_600_000,
      actions: [
        {
          profile_id: USER_A,
          entitlement_id: 'pro',
          product_id: PRO_PRODUCT_ID,
          active: true,
        },
      ],
    });
  });

  it('revokes an exact-product refund even when entitlement_ids is omitted', () => {
    const result = parseRevenueCatEvent(
      payload({ type: 'CANCELLATION', entitlement_ids: undefined }),
    );
    expect(result.kind).toBe('apply');
    if (result.kind === 'apply') expect(result.actions[0]?.active).toBe(false);
  });

  it('restores access when a refund is reversed', () => {
    const result = parseRevenueCatEvent(payload({ type: 'REFUND_REVERSED' }));
    expect(result.kind).toBe('apply');
    if (result.kind === 'apply') expect(result.actions[0]?.active).toBe(true);
  });

  it('ignores other products and future event types without mutating access', () => {
    expect(parseRevenueCatEvent(payload({ product_id: 'another.product' }))).toEqual({
      kind: 'ignored',
      reason: 'different_product',
    });
    expect(parseRevenueCatEvent(payload({ type: 'SOMETHING_NEW' }))).toEqual({
      kind: 'ignored',
      reason: 'unsupported_type',
    });
  });

  it('selects the one Supabase UUID among RevenueCat anonymous aliases', () => {
    const result = parseRevenueCatEvent(
      payload({
        app_user_id: '$RCAnonymousID:abc',
        original_app_user_id: '$RCAnonymousID:abc',
        aliases: ['$RCAnonymousID:abc', USER_A],
      }),
    );
    expect(result.kind).toBe('apply');
    if (result.kind === 'apply') expect(result.actions[0]?.profile_id).toBe(USER_A);
  });

  it('fails closed when one purchase customer contains multiple PRism UUIDs', () => {
    expect(parseRevenueCatEvent(payload({ aliases: [USER_A, USER_B] }))).toEqual({
      kind: 'invalid',
      reason: 'identity',
    });
  });

  it('atomically describes every source revocation and the destination grant for a transfer', () => {
    expect(
      parseRevenueCatEvent(
        payload({
          type: 'TRANSFER',
          product_id: undefined,
          entitlement_id: undefined,
          entitlement_ids: undefined,
          transferred_from: [USER_A, '$RCAnonymousID:old'],
          transferred_to: ['$RCAnonymousID:new', USER_B],
        }),
      ),
    ).toEqual({
      kind: 'apply',
      eventId: 'event-1',
      eventType: 'TRANSFER',
      eventTimestampMs: 1_786_269_600_000,
      actions: [
        {
          profile_id: USER_A,
          entitlement_id: 'pro',
          product_id: PRO_PRODUCT_ID,
          active: false,
        },
        {
          profile_id: USER_B,
          entitlement_id: 'pro',
          product_id: PRO_PRODUCT_ID,
          active: true,
        },
      ],
    });
  });

  it('rejects contradictory product data if a transfer payload ever includes it', () => {
    expect(
      parseRevenueCatEvent(
        payload({
          type: 'TRANSFER',
          product_id: 'another.product',
          entitlement_ids: undefined,
          transferred_from: [USER_A],
          transferred_to: [USER_B],
        }),
      ),
    ).toEqual({ kind: 'ignored', reason: 'different_product' });
  });

  it('rejects a transfer with no single custom destination', () => {
    expect(
      parseRevenueCatEvent(
        payload({ type: 'TRANSFER', transferred_from: [USER_A], transferred_to: [USER_A, USER_B] }),
      ),
    ).toEqual({ kind: 'invalid', reason: 'identity' });
  });

  it('rejects malformed supported events', () => {
    expect(parseRevenueCatEvent({ api_version: '1.0', event: {} })).toEqual({
      kind: 'invalid',
      reason: 'shape',
    });
    expect(parseRevenueCatEvent({ api_version: '2.0', event: {} })).toEqual({
      kind: 'invalid',
      reason: 'shape',
    });
  });
});
