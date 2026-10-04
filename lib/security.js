const INACTIVE_STATUSES = new Set([
  'false',
  '0',
  'inactive',
  'disabled',
  'deactivated',
  'no',
]);

/**
 * Treat blank/legacy statuses as active. Explicit inactive values are blocked.
 * Supports both Boolean (new schema) and string (legacy) status values.
 */
export function isActiveAccount(employee) {
  if (!employee) return false;
  // Handle native Boolean (new schema)
  if (typeof employee.status === 'boolean') return employee.status;
  if (employee.status == null || String(employee.status).trim() === '') return true;
  return !INACTIVE_STATUSES.has(String(employee.status).trim().toLowerCase());
}

/**
 * Allow only same-origin paths and http(s) URLs.
 * Blocks javascript:, data:, and protocol-relative links.
 */
export function isSafeResourceUrl(value) {
  if (value == null) return false;
  const raw = String(value).trim();
  if (!raw) return false;

  if (raw.startsWith('/') && !raw.startsWith('//') && !raw.includes('\\') && !raw.includes('://')) {
    return !raw.includes('\0');
  }

  try {
    const url = new URL(raw);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Empty values become null. Invalid values are rejected.
 */
export function normalizeResourceUrl(value) {
  if (value == null || String(value).trim() === '') {
    return { ok: true, url: null };
  }
  const raw = String(value).trim();
  if (!isSafeResourceUrl(raw)) {
    return { ok: false, url: null };
  }
  return { ok: true, url: raw };
}

/**
 * Keep post-login redirects inside this app.
 */
export function safeInternalPath(value, fallback = '/dashboard') {
  if (typeof value !== 'string') return fallback;
  const path = value.trim();
  if (!path.startsWith('/') || path.startsWith('//') || path.startsWith('/\\')) return fallback;
  if (path.includes('://') || path.includes('\\') || path.includes('\0')) return fallback;
  if (path === '/login' || path.startsWith('/login?') || path.startsWith('/login/')) return fallback;
  return path;
}

/**
 * Resolve displayable image URL.
 * Automatically routes Google Cloud Storage URLs through the local /api/files proxy
 * to prevent 403 Forbidden errors on private/uniform-access buckets.
 */
export function getSafeImageUrl(value) {
  if (!value) return '';
  const raw = String(value).trim();
  if (!raw) return '';

  const gcsMatch = raw.match(/^https?:\/\/storage\.googleapis\.com\/[^/]+\/(.+)$/);
  if (gcsMatch && gcsMatch[1]) {
    return `/api/files/${gcsMatch[1]}`;
  }

  const s3Match = raw.match(/^https?:\/\/[^/]*\.neon\.tech\/[^/]+\/(.+)$/);
  if (s3Match && s3Match[1]) {
    return `/api/files/${s3Match[1]}`;
  }

  return raw;
}
