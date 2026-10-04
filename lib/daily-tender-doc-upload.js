export const DOC_FOLDER = 'daily-tender-docs';
export const MAX_DOC_MB = 20;
export const MAX_DOC_SIZE = MAX_DOC_MB * 1024 * 1024;
export const DOC_SIZE_MESSAGE = `Document file size must not exceed ${MAX_DOC_MB} MB.`;

export const MIME_MAP = {
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

export const ALLOWED_EXTS = Object.keys(MIME_MAP);

const STORED_KEY = new RegExp(`^${DOC_FOLDER}/[0-9a-f-]{36}(\\.[a-z0-9]+)?$`);

export function docExtension(filename) {
  return String(filename || '').split('.').pop()?.toLowerCase() || '';
}

export function docFileError(filename, size) {
  const ext = docExtension(filename);
  if (!ext || !ALLOWED_EXTS.includes(ext)) {
    return `File format ".${ext || 'unknown'}" is not supported. Allowed formats: ${ALLOWED_EXTS.map((item) => `.${item}`).join(', ')}`;
  }
  if (size && size > MAX_DOC_SIZE) return DOC_SIZE_MESSAGE;
  return '';
}

export function isStoredDocKey(key) {
  return STORED_KEY.test(String(key || ''));
}

export function storedDocResponse({ gcsPath, publicUrl, filename, size, mimeType }) {
  return {
    url: `/api/files/${gcsPath}`,
    directUrl: publicUrl || `/api/files/${gcsPath}`,
    gcsPath,
    filename,
    size,
    mimeType,
  };
}
