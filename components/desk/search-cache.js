/** Last search answers in this browser tab, so a refresh does not search again. */
const PREFIX = 'desk-search:v2:';
const TTL_MS = 10 * 60 * 1000;

export function readSearchCache(key) {
  try {
    const hit = JSON.parse(window.sessionStorage.getItem(PREFIX + key) || 'null');
    return hit && Date.now() - hit.at < TTL_MS ? hit.data : null;
  } catch { return null; }
}

export function writeSearchCache(key, data) {
  // A search with no web answer may be a passing error; let a refresh try again.
  if (!data?.online?.rows?.length) return;
  try { window.sessionStorage.setItem(PREFIX + key, JSON.stringify({ at: Date.now(), data })); } catch { /* storage full or blocked */ }
}

/** After a tender is saved, cached results would still offer to fetch it. */
export function clearSearchCache() {
  try {
    for (let i = window.sessionStorage.length - 1; i >= 0; i--) {
      const key = window.sessionStorage.key(i);
      if (key?.startsWith(PREFIX)) window.sessionStorage.removeItem(key);
    }
  } catch { /* storage blocked */ }
}
