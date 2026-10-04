import path from 'path';
import { fileURLToPath } from 'url';

/** @type {import('next').NextConfig} */
const isProduction = process.env.NODE_ENV === 'production';
const projectRoot = path.dirname(fileURLToPath(import.meta.url));

// Next.js dev tooling (React Refresh, source maps) needs eval. Production bundles do not,
// so the production policy drops it and adds transport hardening.
const scriptSrc = ["'self'", "'unsafe-inline'", ...(isProduction ? [] : ["'unsafe-eval'"])];

// Large uploads PUT straight to object storage, and large downloads redirect there,
// because Vercel functions cap request and response bodies at about 4.5 MB.
function storageOrigin() {
  try {
    const endpoint = String(process.env.AWS_ENDPOINT_URL_S3 || '').trim();
    return endpoint ? new URL(endpoint).origin : '';
  } catch {
    return '';
  }
}

const connectSrc = ["'self'", 'blob:', 'https://raw.githack.com', storageOrigin()].filter(Boolean);

const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src ${scriptSrc.join(' ')}`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob: https:",
  `connect-src ${connectSrc.join(' ')}`,
  "worker-src blob:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  ...(isProduction ? ['upgrade-insecure-requests'] : []),
];

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(self)' },
  { key: 'X-DNS-Prefetch-Control', value: 'off' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'Content-Security-Policy', value: contentSecurityPolicy.join('; ') },
  ...(isProduction
    ? [{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' }]
    : []),
];

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // A package-lock.json in the user home folder otherwise becomes the traced root.
  outputFileTracingRoot: projectRoot,
  serverExternalPackages: ['pdfjs-dist'],
  experimental: {
    // middleware.js runs on /api too; above this size Next truncates the body and uploads fail to parse.
    // Must stay above the largest single-file upload that goes through the server (50MB for BOQ documents).
    middlewareClientMaxBodySize: '60mb',
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders.filter((h) => h.key !== 'Content-Security-Policy'),
      },
      {
        // Document routes set a stricter policy appropriate for downloads/PDFs.
        source: '/:path((?!api/desk/documents/).*)',
        headers: securityHeaders.filter((h) => h.key === 'Content-Security-Policy'),
      },
    ];
  },
};

export default nextConfig;
