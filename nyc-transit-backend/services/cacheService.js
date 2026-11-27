// In-memory TTL cache with:
//  - single-flight loading: concurrent misses for one key share one loader call
//  - stale-on-error: if a refresh fails, recent data is served and marked stale
//  - keepFresh(): background refresh while the key has been requested recently
export function createCache() {
  const entries = new Map();
  const inflight = new Map();
  const touched = new Map();

  const load = (key, loader) => {
    if (inflight.has(key)) return inflight.get(key);
    const promise = (async () => {
      const value = await loader();
      const loadedAt = Date.now();
      const entry = { value, loadedAt, cachedAt: new Date(loadedAt).toISOString() };
      entries.set(key, entry);
      return entry;
    })().finally(() => inflight.delete(key));
    inflight.set(key, promise);
    return promise;
  };

  const describe = (entry, { cached, stale }) => ({
    value: entry.value,
    cached,
    stale,
    cachedAt: entry.cachedAt,
    ageSeconds: Math.round((Date.now() - entry.loadedAt) / 1000),
  });

  async function get(key, ttlMs, loader, { maxStaleMs = 0 } = {}) {
    const now = Date.now();
    touched.set(key, now);
    const entry = entries.get(key);
    if (entry && now - entry.loadedAt < ttlMs) {
      return describe(entry, { cached: true, stale: false });
    }

    try {
      return describe(await load(key, loader), { cached: false, stale: false });
    } catch (error) {
      if (entry && now - entry.loadedAt <= maxStaleMs) {
        console.warn(`[Cache] Refresh of ${key} failed, serving stale data: ${error.message}`);
        return describe(entry, { cached: true, stale: true });
      }
      throw error;
    }
  }

  function keepFresh(key, loader, { intervalMs, idleMs = 120_000 }) {
    touched.set(key, Date.now());
    const refresh = () => {
      if (Date.now() - (touched.get(key) || 0) > idleMs) return;
      load(key, loader).catch((error) =>
        console.warn(`[Cache] Background refresh of ${key} failed: ${error.message}`)
      );
    };
    refresh();
    const timer = setInterval(refresh, intervalMs);
    timer.unref();
    return () => clearInterval(timer);
  }

  const stats = () => ({
    engine: 'memory',
    entries: entries.size,
    keys: [...entries.keys()],
  });

  return { get, keepFresh, stats };
}
