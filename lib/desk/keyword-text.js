/** Comma-separated words from the admin upload. These are the search keyword filter. */
export function normalizeKeywords(value) {
  const parts = String(value || '')
    .split(/[,;\n]+/)
    .map((part) => part.trim().toLowerCase().replace(/\s+/g, ' '))
    .filter((part) => part.length > 1);
  return [...new Set(parts)].join(',');
}

export function keywordList(stored) {
  return String(stored || '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}
