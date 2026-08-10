/** Pure RevenueCat event validation and mapping. No environment, network or logs. */

export const PRO_PRODUCT_ID = 'app.prism.trainer.pro.lifetime';
export const PRO_ENTITLEMENT_ID = 'pro';

export interface EntitlementAction {
  profile_id: string;
  entitlement_id: typeof PRO_ENTITLEMENT_ID;
  product_id: typeof PRO_PRODUCT_ID;
  active: boolean;
}

export type RevenueCatEventResult =
  | {
      kind: 'apply';
      eventId: string;
      eventType: SupportedEventType;
      eventTimestampMs: number;
      actions: EntitlementAction[];
    }
  | { kind: 'ignored'; reason: 'unsupported_type' | 'different_product' }
  | { kind: 'invalid'; reason: 'shape' | 'identity' };

type SupportedEventType =
  | 'NON_RENEWING_PURCHASE'
  | 'CANCELLATION'
  | 'REFUND_REVERSED'
  | 'TRANSFER';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function record(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function uuidList(values: unknown[]): string[] {
  return [
    ...new Set(
      values
        .filter((value): value is string => typeof value === 'string' && UUID.test(value))
        .map((value) => value.toLowerCase()),
    ),
  ];
}

function action(profileId: string, active: boolean): EntitlementAction {
  return {
    profile_id: profileId,
    entitlement_id: PRO_ENTITLEMENT_ID,
    product_id: PRO_PRODUCT_ID,
    active,
  };
}

function hasProEntitlement(event: Record<string, unknown>): boolean {
  return (
    event.entitlement_id === PRO_ENTITLEMENT_ID ||
    strings(event.entitlement_ids).includes(PRO_ENTITLEMENT_ID)
  );
}

function purchaseIdentity(event: Record<string, unknown>): string | null {
  const ids = uuidList([
    event.app_user_id,
    event.original_app_user_id,
    ...strings(event.aliases),
  ]);
  // Multiple Supabase UUIDs on one RevenueCat customer are an identity conflict,
  // not permission to grant multiple PRism accounts.
  return ids.length === 1 ? ids[0] : null;
}

/**
 * Validate a provider payload and reduce it to the only writes v1 supports.
 * Unknown future event types are acknowledged without mutation; malformed
 * supported events fail so RevenueCat's delivery log makes the problem visible.
 */
export function parseRevenueCatEvent(payload: unknown): RevenueCatEventResult {
  const root = record(payload);
  const event = record(root?.event);
  if (!root || root.api_version !== '1.0' || !event) return { kind: 'invalid', reason: 'shape' };

  const eventId = event.id;
  const eventType = event.type;
  const eventTimestampMs = event.event_timestamp_ms;
  if (
    typeof eventId !== 'string' ||
    eventId.trim().length === 0 ||
    eventId.length > 255 ||
    typeof eventType !== 'string' ||
    typeof eventTimestampMs !== 'number' ||
    !Number.isSafeInteger(eventTimestampMs) ||
    eventTimestampMs <= 0
  ) {
    return { kind: 'invalid', reason: 'shape' };
  }

  const supported: readonly string[] = [
    'NON_RENEWING_PURCHASE',
    'CANCELLATION',
    'REFUND_REVERSED',
    'TRANSFER',
  ];
  if (!supported.includes(eventType)) return { kind: 'ignored', reason: 'unsupported_type' };
  const type = eventType as SupportedEventType;

  if (type === 'TRANSFER') {
    // RevenueCat's documented TRANSFER shape names identities but not the
    // products/entitlements moved. S4 therefore relies on the release contract
    // that this is a dedicated PRism project containing only the `pro` mapping.
    // If a provider ever includes product fields, reject an explicit mismatch
    // rather than letting that project assumption override contradictory data.
    if (event.product_id != null && event.product_id !== PRO_PRODUCT_ID) {
      return { kind: 'ignored', reason: 'different_product' };
    }
    if (
      (event.entitlement_id != null || event.entitlement_ids != null) &&
      !hasProEntitlement(event)
    ) {
      return { kind: 'ignored', reason: 'different_product' };
    }
    const from = uuidList(strings(event.transferred_from));
    const to = uuidList(strings(event.transferred_to));
    if (to.length !== 1) return { kind: 'invalid', reason: 'identity' };

    const destination = to[0];
    const actions = [
      ...from.filter((profileId) => profileId !== destination).map((profileId) => action(profileId, false)),
      action(destination, true),
    ];
    return { kind: 'apply', eventId, eventType: type, eventTimestampMs, actions };
  }

  if (event.product_id !== PRO_PRODUCT_ID) {
    return { kind: 'ignored', reason: 'different_product' };
  }
  // A cancellation for the exact lifetime product is sufficient to revoke even
  // when RevenueCat omits entitlement_ids. Grant paths require the mapping.
  if (type !== 'CANCELLATION' && !hasProEntitlement(event)) {
    return { kind: 'ignored', reason: 'different_product' };
  }

  const profileId = purchaseIdentity(event);
  if (!profileId) return { kind: 'invalid', reason: 'identity' };

  return {
    kind: 'apply',
    eventId,
    eventType: type,
    eventTimestampMs,
    actions: [action(profileId, type !== 'CANCELLATION')],
  };
}
