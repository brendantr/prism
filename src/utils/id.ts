import * as Crypto from 'expo-crypto';

/**
 * Client-side id generation.
 *
 * Ids are minted on the device so a set can be logged, edited and re-rendered
 * with no round trip. Format is a UUID v4, which means these values drop
 * straight into the Postgres `uuid` columns when a session syncs.
 *
 * They must be unguessable, not merely unique. These ids become **primary
 * keys**, and a primary key is unique across the whole table regardless of who
 * owns the row -- row-level security does not scope it. So an attacker who can
 * predict the ids another lifter is about to generate can insert rows carrying
 * those ids under their own `profile_id` (which passes the RLS `with check`)
 * and cause the victim's next write to fail on a key collision.
 *
 * That is why this uses the platform CSPRNG rather than `Math.random()`, whose
 * generator state is recoverable from a modest run of its own output.
 */

/**
 * `prefix` is carried only in dev logs, never in the returned value, so ids
 * stay valid uuids. It exists to make the call sites self-documenting.
 */
export function newId(_prefix?: string): string {
  return Crypto.randomUUID();
}
