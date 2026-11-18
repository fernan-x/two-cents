// The expo-sqlite key-value store is native; tests use an in-memory map with the same API.
jest.mock('expo-sqlite/kv-store', () => {
  const store = new Map<string, string>();
  const api = {
    getItem: async (k: string) => store.get(k) ?? null,
    setItem: async (k: string, v: string) => void store.set(k, v),
    removeItem: async (k: string) => void store.delete(k),
    clear: async () => store.clear(),
  };
  return { __esModule: true, default: api };
});
