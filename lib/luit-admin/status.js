import { prisma } from '@/lib/prisma';
import { isS3Configured } from '@/lib/s3-storage';
import { twoCaptchaKeyStatus } from '@/lib/two-captcha';
import { usableGeminiKey } from '@/lib/desk/ai/gemini';
import pkg from '@/package.json';

/** Health of the services this deployment depends on. Never returns a secret value. */
export async function systemStatus() {
  let database;
  try {
    const started = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    database = { ok: true, detail: `Responded in ${Date.now() - started} ms` };
  } catch {
    database = { ok: false, detail: 'Not reachable' };
  }
  const gcs = Boolean(process.env.GCS_CREDENTIALS_BASE64 || process.env.GCS_CREDENTIALS_JSON || process.env.GCS_KEY_FILE_PATH);
  const s3 = isS3Configured();
  return {
    version: pkg.version,
    commit: (process.env.VERCEL_GIT_COMMIT_SHA || process.env.GIT_COMMIT || '').slice(0, 7) || null,
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV || 'unknown',
    checks: [
      { id: 'database', label: 'Database', ...database },
      { id: 'storage', label: 'File storage', ok: s3 || gcs, detail: s3 ? 'S3 storage' : gcs ? 'Google Cloud Storage' : 'No storage credentials set' },
      { id: 'gemini', label: 'Gemini (Luit AI)', ok: Boolean(usableGeminiKey(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY)), detail: 'Search reading and web search' },
      { id: 'captcha', label: '2Captcha (portal downloads)', ok: twoCaptchaKeyStatus().configured, detail: 'Captcha step on official portals' },
      { id: 'jwt', label: 'Session signing secret', ok: Boolean(String(process.env.JWT_SECRET || '').trim()), detail: 'JWT_SECRET set in the environment' },
    ],
  };
}
