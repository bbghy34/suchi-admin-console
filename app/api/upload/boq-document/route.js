import { requireRoles } from '@/lib/auth';
import { errorResponse, successResponse, handleApiError } from '@/lib/api-response';
import { uploadToGCS } from '@/lib/gcs';

/**
 * POST /api/upload/boq-document
 *
 * Accepts multipart/form-data with:
 *   - file: Document file (.pdf, .xlsx, .xls, .csv, .docx, .doc, .jpg, .jpeg, .png, .webp, .zip, .dwg, .txt), max 50MB
 *
 * Uploads to object storage (Neon DB Object Storage / S3) under 'boq-files/' folder.
 * Returns { url, gcsPath, filename, size, mimeType }
 *
 * Access: ADMIN ('A') and MANAGER ('M')
 */
export const POST = requireRoles(['A', 'M'])(async (request) => {
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
    const ext = filename.split('.').pop()?.toLowerCase();

    const allowedExts = [
      'pdf',
      'xlsx',
      'xls',
      'csv',
      'docx',
      'doc',
      'jpg',
      'jpeg',
      'png',
      'webp',
      'svg',
      'txt',
      'zip',
      'rar',
      'dwg',
      'dxf',
    ];

    if (!ext || !allowedExts.includes(ext)) {
      return errorResponse(
        `File format ".${ext || 'unknown'}" is not supported. Allowed formats: ${allowedExts.map((e) => `.${e}`).join(', ')}`,
        400
      );
    }

    // Maximum file size: 50MB
    const MAX_SIZE = 50 * 1024 * 1024;
    if (file.size && file.size > MAX_SIZE) {
      return errorResponse('Document file size must not exceed 50MB.', 400);
    }

    const mimeMap = {
      pdf: 'application/pdf',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      xls: 'application/vnd.ms-excel',
      csv: 'text/csv',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      doc: 'application/msword',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      webp: 'image/webp',
      svg: 'image/svg+xml',
      txt: 'text/plain',
      zip: 'application/zip',
      rar: 'application/x-rar-compressed',
      dwg: 'image/vnd.dwg',
      dxf: 'image/vnd.dxf',
    };

    const mimeType = file.type || mimeMap[ext] || 'application/octet-stream';
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const { publicUrl, gcsPath } = await uploadToGCS(buffer, filename, 'boq-files', mimeType);
    const proxyUrl = `/api/files/${gcsPath}`;

    return successResponse(
      {
        url: proxyUrl,
        directUrl: publicUrl,
        gcsPath,
        filename,
        size: file.size,
        mimeType,
      },
      'Document uploaded successfully to storage.',
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
