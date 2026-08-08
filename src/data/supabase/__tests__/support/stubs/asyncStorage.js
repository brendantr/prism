/** Unreachable in this lane -- nothing here writes a local draft -- but the
 *  module is in the import graph, so it has to resolve. */
const map = new Map();
module.exports = {
  getItem: async (k) => map.get(k) ?? null,
  setItem: async (k, v) => void map.set(k, v),
  removeItem: async (k) => void map.delete(k),
  multiRemove: async (ks) => ks.forEach((k) => map.delete(k)),
  clear: async () => map.clear(),
};
