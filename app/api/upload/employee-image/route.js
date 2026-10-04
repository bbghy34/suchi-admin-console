import { requireRoles } from '@/lib/auth';
import { errorResponse, successResponse, handleApiError } from '@/lib/api-response';
import { uploadToGCS } from '@/lib/gcs';

/**
 * POST /api/upload/employee-image
 *
 * Accepts multipart/form-data with:
 *   - file: Image file (.jpg, .jpeg, .png, .webp, .gif, .svg), max 5MB
 *
 * Uploads to GCS under 'employee-profiles/' folder.
 * Returns { publicUrl, gcsPath }
 *
 * Access: ADMIN ('A') and MANAGER ('M')
 */
export const POST = requireRoles(['A', 'M'])(async (request, context) => {
  try {
    const formData = await request.formData().catch(() => null);
    if (!formData) {
      return errorResponse('Multipart form data is required.', 400);
    }

    const file = formData.get('file');
    if (!file || typeof file === 'string') {
      return errorResponse('No image file provided.', 400);
    }

    const filename = file.name || 'profile.jpg';
    const ext = filename.split('.').pop()?.toLowerCase();
    const allowedExts = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg'];
    if (!ext || !allowedExts.includes(ext)) {
      return errorResponse('Only image files (.jpg, .jpeg, .png, .webp, .gif, .svg) are accepted.', 400);
    }

    const mimeMap = {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      webp: 'image/webp',
      gif: 'image/gif',
      svg: 'image/svg+xml',
    };
    const mimeType = file.type || mimeMap[ext] || 'application/octet-stream';

    // File size check (5MB limit)
    const MAX_SIZE = 5 * 1024 * 1024;
    if (file.size && file.size > MAX_SIZE) {
      return errorResponse('Profile image size must not exceed 5MB.', 400);
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const { publicUrl, gcsPath } = await uploadToGCS(buffer, filename, 'employee-profiles', mimeType);
    const proxyUrl = `/api/files/${gcsPath}`;

    return successResponse(
      {
        publicUrl: proxyUrl,
        directGcsUrl: publicUrl,
        gcsPath,
      },
      'Profile image uploaded successfully to storage bucket.',
      201
    );
  } catch (error) {
    if (error.message?.includes('GCS_') || error.message?.includes('bucket') || error.message?.includes('S3')) {
      return errorResponse(`File storage is not configured: ${error.message}`, 503);
    }
    return handleApiError(error, 'Failed to upload profile image');
  }
});
