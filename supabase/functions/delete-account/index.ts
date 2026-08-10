import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  authenticatedUserId,
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
  if (!supabaseUrl || !anonKey || !revenueCatProjectId || !revenueCatSecretKey) return json(503);

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
