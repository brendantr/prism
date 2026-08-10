import { createClient } from 'npm:@supabase/supabase-js@2';
import { parseRevenueCatEvent } from './event.ts';

const MAX_BODY_BYTES = 128 * 1024;

function json(status: number, body: Record<string, unknown>): Response {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

function constantTimeEqual(actual: string | null, expected: string): boolean {
  const left = new TextEncoder().encode(actual ?? '');
  const right = new TextEncoder().encode(expected);
  let difference = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }
  return difference === 0;
}

Deno.serve(async (request: Request) => {
  if (request.method !== 'POST') return json(405, { ok: false });

  const webhookAuth = Deno.env.get('REVENUECAT_WEBHOOK_AUTH') ?? '';
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!webhookAuth || !supabaseUrl || !serviceRoleKey) return json(503, { ok: false });

  if (!constantTimeEqual(request.headers.get('Authorization'), webhookAuth)) {
    return json(401, { ok: false });
  }

  const declaredLength = Number(request.headers.get('Content-Length') ?? '0');
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return json(413, { ok: false });
  }

  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return json(400, { ok: false });
  }
  if (new TextEncoder().encode(rawBody).length > MAX_BODY_BYTES) {
    return json(413, { ok: false });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return json(400, { ok: false });
  }

  const parsed = parseRevenueCatEvent(payload);
  if (parsed.kind === 'invalid') return json(400, { ok: false });
  if (parsed.kind === 'ignored') return json(200, { ok: true });

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await supabase.rpc('apply_revenuecat_entitlement_event', {
    p_event_id: parsed.eventId,
    p_event_type: parsed.eventType,
    p_event_timestamp_ms: parsed.eventTimestampMs,
    p_actions: parsed.actions,
  });

  // No raw provider body, ids or database error is logged. A non-2xx response
  // is enough for RevenueCat to retry and expose the failure in its dashboard.
  if (error) return json(500, { ok: false });
  return json(200, { ok: true });
});
