const DEV_FALLBACK = 'dev-only-suchii-insecure-secret-change-me';

const PLACEHOLDER_SECRETS = new Set([
  'your-strong-production-jwt-secret',
  'suchii-tender-default-secret-change-me',
  'change-me',
  'secret',
]);

/**
 * Resolve the HMAC secret used to sign and verify session tokens.
 * Production refuses missing, short, or placeholder secrets so a known
 * default cannot be used to forge administrator sessions.
 * Returns null when the server is misconfigured.
 */
export function getJwtSecret() {
  const secret = process.env.JWT_SECRET?.trim() || '';
  const weak = secret.length < 24 || PLACEHOLDER_SECRETS.has(secret);

  if (!weak) return secret;

  if (process.env.NODE_ENV === 'production') {
    console.error('[auth] JWT_SECRET is missing or too weak for production.');
    return null;
  }

  return DEV_FALLBACK;
}
