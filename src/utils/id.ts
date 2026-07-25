/**
 * Client-side id generation.
 *
 * Ids are minted on the device so a set can be logged, edited and re-rendered
 * with no round trip. Format is a UUID v4 shape, which means these values drop
 * straight into the Postgres `uuid` columns when a session syncs.
 */

const HEX = '0123456789abcdef';

function uuidV4(): string {
  let out = '';
  for (let i = 0; i < 36; i++) {
    if (i === 8 || i === 13 || i === 18 || i === 23) {
      out += '-';
    } else if (i === 14) {
      out += '4';
    } else if (i === 19) {
      out += HEX[(Math.floor(Math.random() * 16) & 0x3) | 0x8];
    } else {
      out += HEX[Math.floor(Math.random() * 16)];
    }
  }
  return out;
}

/**
 * `prefix` is carried only in dev logs, never in the returned value, so ids
 * stay valid uuids. It exists to make the call sites self-documenting.
 */
export function newId(_prefix?: string): string {
  return uuidV4();
}
