/**
 * Tender files an admin adds at /boatbrothers/tenders.
 * Each upload is one TenderFile row, listed on the tender portal.
 */

export const TENDER_ADMIN_PATH = '/boatbrothers/tenders';

export const TENDER_DOC_KINDS = {
  file: 'Tender file',
  doc: 'Supporting document',
};

export const TENDER_DOC_EXTENSIONS = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'zip', 'jpg', 'jpeg', 'png', 'txt', 'csv'];
export const TENDER_DOC_MAX_BYTES = 20 * 1024 * 1024;
export const TENDER_DOC_MAX_COUNT = 40;

export function isStoredFileUrl(url) {
  return typeof url === 'string' && url.startsWith('/api/files/') && !url.includes('..') && !url.includes('\\');
}

export function publicTenderFile(row, uploaderName) {
  const kind = row.kind === 'file' ? 'file' : 'doc';
  return {
    id: row.id,
    projectId: row.projectId,
    projectName: row.project?.name || null,
    tenderId: row.tenderId,
    kind,
    label: TENDER_DOC_KINDS[kind],
    name: row.name,
    url: row.fileUrl,
    uploadedAt: row.createdAt,
    uploadedBy: uploaderName || null,
    source: 'manual',
  };
}
