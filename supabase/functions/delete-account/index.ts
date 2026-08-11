import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  authenticatedUserId,
  revenueCatConfigured,
  revenueCatCustomerUrl,
  revenueCatDeletionComplete,
} from './contract.ts';

function json(status: number): Response {
  return Response.json({ ok: status >= 200 && status < 300 }, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

Deno.serve(async (request: Request) => {
  if (request.method !== 'POST') return json(405);

  // `supabase/config.toml` keeps verify_jwt enabled. The payload is decoded only
  // after that platform verification and used solely as the custom RevenueCat
  // customer id; no caller-supplied id is accepted in a body or URL.
  const authorization = request.headers.get('Authorization');
  const userId = authenticatedUserId(authorization);
  if (!userId) return json(401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const revenueCatProjectId = Deno.env.get('REVENUECAT_PROJECT_ID') ?? '';
  const revenueCatSecretKey = Deno.env.get('REVENUECAT_SECRET_API_KEY') ?? '';

  // Only the platform values are required. Supabase injects both into every
  // function, so their absence means the deployment itself is broken.
  if (!supabaseUrl || !anonKey) return json(503);

  /*
    RevenueCat is erased only if this deployment has a RevenueCat at all.

    This used to be a fourth condition on the 503 above, which made account
    deletion refuse to run until a payment processor was configured -- on a
    build that sold nothing and had no RevenueCat keys in any environment. That
    inverted the priority: I-10 is a hard store gate and App Review tests it,
    while billing is optional until the day you charge someone.

    What is NOT relaxed is a failure once it IS configured. That still aborts
    before the database delete, so a lifter is never told their data is gone
    while a copy of it sits at a processor. See `revenueCatConfigured`.
  */
  if (revenueCatConfigured(revenueCatProjectId, revenueCatSecretKey)) {
    let revenueCatResponse: Response;
    try {
      revenueCatResponse = await fetch(revenueCatCustomerUrl(revenueCatProjectId, userId), {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${revenueCatSecretKey}` },
      });
    } catch {
      // Contain the provider URL (which includes the UUID) rather than allowing an
      // unhandled fetch error to become a runtime log entry.
      return json(502);
    }
    if (!revenueCatDeletionComplete(revenueCatResponse.status)) return json(502);
  }

  // Invoke the existing no-argument, auth.uid()-derived destructive function
  // as the user. RevenueCat is erased first; if that fails, the database account
  // remains intact and the UI cannot claim deletion succeeded.
  const userSupabase = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authorization! } },
  });
  const { error } = await userSupabase.rpc('delete_my_account');
  if (error) return json(500);

  return json(200);
});
