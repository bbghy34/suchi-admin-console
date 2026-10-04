const buckets = new Map();
const MAX_BUCKETS = 5000;

/**
 * Fixed-window limiter. Suitable as a first line of defense on a single instance.
 */
export function rateLimit(key, limit, windowMs) {
  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing || now > existing.reset) {
    if (buckets.size > MAX_BUCKETS) {
      const oldest = buckets.keys().next().value;
      if (oldest) buckets.delete(oldest);
    }
    buckets.set(key, { count: 1, reset: now + windowMs });
    return { ok: true, retryAfter: 0 };
  }

  existing.count += 1;
  if (existing.count > limit) {
    return { ok: false, retryAfter: Math.max(1, Math.ceil((existing.reset - now) / 1000)) };
  }

  return { ok: true, retryAfter: 0 };
}

export function clientAddress(request) {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return request.headers.get('x-real-ip') || 'unknown';
}
