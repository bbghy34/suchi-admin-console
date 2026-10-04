import { requireRoles } from '@/lib/auth';
import { errorResponse, successResponse, handleApiError } from '@/lib/api-response';
import { deleteFromS3, isS3Configured, s3ObjectInfo } from '@/lib/s3-storage';
import { DOC_SIZE_MESSAGE, MAX_DOC_SIZE, isStoredDocKey, storedDocResponse } from '@/lib/daily-tender-doc-upload';

/**
 * POST /api/upload/daily-tender-doc/complete
 * Body: { key, filename }. Confirms a direct upload landed and is within the size limit,
 * since a signed PUT link cannot cap the size by itself.
 * Access: tender role only.
 */
export const POST = requireRoles(['A', 'M', 'T'])(async (request) => {
  try {
    if (!isS3Configured()) return errorResponse('Direct uploads are not available.', 400);

    const body = await request.json().catch(() => null);
    const key = String(body?.key || '');
    if (!isStoredDocKey(key)) return errorResponse('Upload reference is invalid.', 400);

    const info = await s3ObjectInfo(key);
    if (!info) return errorResponse('The file did not reach storage. Please upload it again.', 404);
    if (info.size > MAX_DOC_SIZE) {
      await deleteFromS3(key);
      return errorResponse(DOC_SIZE_MESSAGE, 400);
    }

    const filename = String(body?.filename || info.metadata.originalname || key.split('/').pop()).slice(0, 255);
    return successResponse(
      storedDocResponse({ gcsPath: key, filename, size: info.size, mimeType: info.contentType }),
      'Document uploaded.',
      201
    );
  } catch (error) {
    return handleApiError(error, 'Could not finish the upload');
  }
});
