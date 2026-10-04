import { requireRoles } from '@/lib/auth';
import { errorResponse, successResponse, handleApiError } from '@/lib/api-response';
import { isS3Configured, presignS3Upload } from '@/lib/s3-storage';
import { DOC_FOLDER, MIME_MAP, docExtension, docFileError } from '@/lib/daily-tender-doc-upload';

/**
 * POST /api/upload/daily-tender-doc/presign
 * Body: { filename, size }. Returns a short-lived link the browser PUTs the file to,
 * then the form calls ./complete. `direct: false` means storage cannot take direct uploads.
 * Access: tender role only.
 */
export const POST = requireRoles(['A', 'M', 'T'])(async (request) => {
  try {
    const body = await request.json().catch(() => null);
    const filename = String(body?.filename || '').trim().slice(0, 255);
    const size = Number(body?.size || 0);
    if (!filename) return errorResponse('File name is required.', 400);
    if (!Number.isFinite(size) || size < 0) return errorResponse('File size is invalid.', 400);

    const invalid = docFileError(filename, size);
    if (invalid) return errorResponse(invalid, 400);

    if (!isS3Configured()) return successResponse({ direct: false }, 'Upload through the server.');

    const mimeType = MIME_MAP[docExtension(filename)] || 'application/octet-stream';
    const { key, uploadUrl, headers } = await presignS3Upload(filename, DOC_FOLDER, mimeType);
    return successResponse({ direct: true, key, uploadUrl, headers, mimeType }, 'Upload link ready.');
  } catch (error) {
    return handleApiError(error, 'Could not prepare the upload');
  }
});
