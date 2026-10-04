import { requireRoles } from '@/lib/auth';
import { errorResponse, successResponse, handleApiError } from '@/lib/api-response';
import { uploadToGCS } from '@/lib/gcs';
import { DOC_FOLDER, MIME_MAP, docExtension, docFileError, storedDocResponse } from '@/lib/daily-tender-doc-upload';

/**
 * POST /api/upload/daily-tender-doc
 * One document for a daily-tender file field, sent through the server.
 * Hosted on Vercel this only works below about 4.5 MB; the form uses ./presign and ./complete first.
 * Access: tender role only.
 */
export const POST = requireRoles(['A', 'M', 'T'])(async (request) => {
  try {
    const formData = await request.formData().catch(() => null);
    if (!formData) {
      return errorResponse('Multipart form data is required.', 400);
    }

    const file = formData.get('file');
    if (!file || typeof file === 'string') {
      return errorResponse('No document file provided.', 400);
    }

    const filename = file.name || 'document.pdf';
    const invalid = docFileError(filename, file.size);
    if (invalid) return errorResponse(invalid, 400);

    const mimeType = file.type || MIME_MAP[docExtension(filename)] || 'application/octet-stream';
    const buffer = Buffer.from(await file.arrayBuffer());
    const { publicUrl, gcsPath } = await uploadToGCS(buffer, filename, DOC_FOLDER, mimeType);

    return successResponse(
      storedDocResponse({ gcsPath, publicUrl, filename, size: file.size, mimeType }),
      'Document uploaded.',
      201
    );
  } catch (error) {
    if (
      error.message?.includes('GCS_') ||
      error.message?.includes('bucket') ||
      error.message?.includes('S3') ||
      error.message?.includes('storage')
    ) {
      return errorResponse(`File storage is not configured: ${error.message}`, 503);
    }
    return handleApiError(error, 'Failed to upload document');
  }
});
