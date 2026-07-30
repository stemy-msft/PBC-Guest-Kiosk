// Test environment setup.
//
// Node 26 defines a native `localStorage`/`sessionStorage` global that is
// disabled (undefined) unless started with `--localstorage-file`, and it
// shadows the jsdom implementation. Install a minimal in-memory Storage so the
// application code (api.js) and the tests share the same working storage.

function makeStorage() {
  const store = new Map();
  return {
    clear() {
      store.clear();
    },
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    },
    key(index) {
      return Array.from(store.keys())[index] ?? null;
    },
    get length() {
      return store.size;
    },
  };
}

Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  writable: true,
  value: makeStorage(),
});

Object.defineProperty(globalThis, "sessionStorage", {
  configurable: true,
  writable: true,
  value: makeStorage(),
});
