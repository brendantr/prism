/**
 * `newId()` wants a CSPRNG uuid v4. Node's `crypto` is one.
 * The property under test in this lane is what Postgres does with the id, not
 * where the entropy came from -- `src/utils/__tests__/id.test.ts` covers that.
 */
const { randomUUID, getRandomValues } = require('node:crypto');
module.exports = { randomUUID, getRandomValues };
