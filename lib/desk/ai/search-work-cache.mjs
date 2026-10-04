/** Bounded public-search cache; pending identical work is shared by callers. */
export function createSearchWorkCache({ ttlMs, maxEntries = 200, now = Date.now, cacheable = () => true }) {
  const completed = new Map();
  const pending = new Map();
  return async function reuse(key, work) {
    const hit = completed.get(key);
    if (hit && now() - hit.at < ttlMs) return hit.value;
    if (hit) completed.delete(key);
    if (pending.has(key)) return pending.get(key);
    // Start on the next microtask so the promise is registered before work runs.
    const task = Promise.resolve().then(work).then(value => {
      if (cacheable(value)) {
        completed.set(key, { at: now(), value });
        if (completed.size > maxEntries) completed.delete(completed.keys().next().value);
      }
      return value;
    }).finally(() => pending.delete(key));
    pending.set(key, task);
    return task;
  };
}

/** Merge repeated citations before the fetch cap, retaining only grounded text. */
export function uniqueCitedHits(hits, limit = 24) {
  const unique = new Map();
  for (const hit of hits) {
    const uri = String(hit.chunk?.uri || '').trim();
    if (!uri) continue;
    const prior = unique.get(uri);
    if (prior) {
      if (hit.cited && !prior.parts.has(hit.cited)) prior.parts.add(hit.cited);
    } else if (unique.size < limit) {
      unique.set(uri, { chunk: hit.chunk, parts: new Set(hit.cited ? [hit.cited] : []) });
    }
  }
  return [...unique.values()].map(({ chunk, parts }) => ({ chunk, cited: [...parts].join(' ').slice(0, 12000) }));
}

export function isGroundingRedirect(uri) {
  try {
    const url = new URL(uri);
    return url.protocol === 'https:' && url.hostname === 'vertexaisearch.cloud.google.com' && !url.username && !url.password;
  } catch { return false; }
}
