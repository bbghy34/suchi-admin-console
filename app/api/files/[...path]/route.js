import { downloadFromGCS } from '@/lib/gcs';
import { isS3Configured, presignS3Download, s3ObjectInfo } from '@/lib/s3-storage';
import { getAuthenticatedUser } from '@/lib/auth';
import { isLuitAdmin } from '@/lib/roles';
import { missingFileCached, rememberMissingFile, forgetMissingFile } from '@/lib/read-cache';

// Vercel functions cannot return bodies over about 4.5 MB; larger files go out as a signed storage link.
const MAX_PROXIED_BYTES = 4 * 1024 * 1024;

const STAFF_PREFIXES = ['tender-packs/', 'boq-files/', 'site-progress/', 'project-payments/', 'boq-bills/'];

function canReadStoredFile(viewer, gcsPath) {
  const path = String(gcsPath || '').replace(/^\/+/, '');
  const staff = viewer.role === 'A' || viewer.role === 'M';
  const bills = viewer.role === 'AA' || viewer.accountRole === 'AA' || isLuitAdmin(viewer.accountRole);
  if (path.startsWith('project-payments/') || path.startsWith('boq-bills/')) return staff || bills;
  if (STAFF_PREFIXES.some((prefix) => path.startsWith(prefix))) return staff;
  if (path.startsWith('daily-tender-docs/')) return staff || viewer.role === 'T';
  if (path.startsWith('boq-received-images/')) return staff || viewer.role === 'E';
  if (path.startsWith('employee-profiles/')) {
    if (staff) return true;
    return String(viewer.profileImageUrl || '').includes(path);
  }
  return false;
}

/**
 * GET /api/files/[...path]
 *
 * Serves a private stored file to a signed-in user who is allowed to see that folder.
 */
export async function GET(request, context) {
  try {
    const viewer = await getAuthenticatedUser(request);
    if (!viewer) {
      return new Response('Authentication required.', { status: 401, headers: { 'Cache-Control': 'private, no-store' } });
    }

    const resolvedParams = await context.params;
    const pathSegments = resolvedParams?.path || [];
    const gcsPath = Array.isArray(pathSegments) ? pathSegments.join('/') : String(pathSegments);

    if (!gcsPath || gcsPath.includes('..') || gcsPath.includes('\0')) {
      return new Response('Invalid path', { status: 400, headers: { 'Cache-Control': 'private, no-store' } });
    }

    if (!canReadStoredFile(viewer, gcsPath)) {
      return new Response('You cannot open this file.', { status: 403, headers: { 'Cache-Control': 'private, no-store' } });
    }

    if (missingFileCached(gcsPath)) {
      return new Response('File not found', { status: 404, headers: { 'Cache-Control': 'private, no-store' } });
    }

    if (isS3Configured()) {
      const info = await s3ObjectInfo(gcsPath);
      if (info && info.size > MAX_PROXIED_BYTES) {
        forgetMissingFile(gcsPath);
        const url = await presignS3Download(gcsPath, {
          filename: info.metadata?.originalname,
          contentType: info.contentType,
        });
        return new Response(null, { status: 302, headers: { Location: url, 'Cache-Control': 'private, no-store' } });
      }
    }

    const fileData = await downloadFromGCS(gcsPath);
    if (!fileData) {
      rememberMissingFile(gcsPath);
      return new Response('File not found', { status: 404, headers: { 'Cache-Control': 'private, no-store' } });
    }
    forgetMissingFile(gcsPath);

    const headers = {
      'Content-Type': fileData.contentType,
      'Content-Length': String(fileData.buffer.length),
      'Cache-Control': 'private, max-age=300',
      'X-Content-Type-Options': 'nosniff',
    };

    const originalName = fileData.metadata?.originalname || fileData.metadata?.originalName;
    if (originalName) {
      const safeName = String(originalName).replace(/[\r\n"]/g, '').slice(0, 180);
      headers['Content-Disposition'] = `inline; filename="${safeName}"`;
    }

    return new Response(fileData.buffer, {
      status: 200,
      headers,
    });
  } catch (error) {
    console.error('Error serving file from storage:', error);
    return new Response('Internal Server Error', { status: 500, headers: { 'Cache-Control': 'private, no-store' } });
  }
}
