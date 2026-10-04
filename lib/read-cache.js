/**
 * Short-lived process cache for reads that repeat on every screen.
 * Failed loads are not stored. Call invalidateReadCache when a write changes the data.
 */
const entries = new Map();
const MAX_ENTRIES = 300;

function prune(now) {
  if (entries.size <= MAX_ENTRIES) return;
  for (const [key, entry] of entries) {
    if (!entry.pending && entry.expires <= now) entries.delete(key);
    if (entries.size <= MAX_ENTRIES) return;
  }
  const oldest = entries.keys().next().value;
  if (oldest) entries.delete(oldest);
}

export function readCache(key, ttlMs, loader) {
  const now = Date.now();
  const current = entries.get(key);
  if (current && current.value !== undefined && current.expires > now) {
    return Promise.resolve(current.value);
  }
  if (current?.pending) return current.pending;

  const pending = Promise.resolve()
    .then(loader)
    .then((value) => {
      if (value == null) {
        entries.delete(key);
        return value;
      }
      entries.set(key, { value, expires: Date.now() + ttlMs });
      prune(Date.now());
      return value;
    })
    .catch((error) => {
      const latest = entries.get(key);
      if (latest?.pending === pending) entries.delete(key);
      throw error;
    });

  entries.set(key, { pending, expires: 0 });
  return pending;
}

export function invalidateReadCache(key) {
  entries.delete(key);
}

export const WAREHOUSE_OPTIONS_KEY = 'warehouse:options';
export const WAREHOUSE_LOW_STOCK_KEY = 'warehouse:low-stock';
export const LOW_STOCK_TTL_MS = 90_000;

export function invalidateWarehouseOptions() {
  invalidateReadCache(WAREHOUSE_OPTIONS_KEY);
}

export function invalidateLowStock() {
  invalidateReadCache(WAREHOUSE_LOW_STOCK_KEY);
}

const missingFiles = new Map();
const MISSING_FILE_TTL_MS = 20_000;
const MISSING_FILE_MAX = 200;

export function missingFileCached(path) {
  const expires = missingFiles.get(path);
  if (!expires) return false;
  if (expires <= Date.now()) {
    missingFiles.delete(path);
    return false;
  }
  return true;
}

export function rememberMissingFile(path) {
  if (!path) return;
  missingFiles.set(path, Date.now() + MISSING_FILE_TTL_MS);
  if (missingFiles.size <= MISSING_FILE_MAX) return;
  const oldest = missingFiles.keys().next().value;
  if (oldest) missingFiles.delete(oldest);
}

export function forgetMissingFile(path) {
  if (path) missingFiles.delete(path);
}
