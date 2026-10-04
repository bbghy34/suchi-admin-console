import { officialCandidate } from './identity.mjs';
import { directDocumentIdentity } from './direct-document.mjs';
import { publicNoticeIdentity } from './public-notice.mjs';

// Shared Desk storage is the cache. Never key official files by requesting user,
// search wording, or a session-specific GePNIC detail URL.
export function savedDownloadKey(input = {}) {
  const row = input.row || input;
  const link = input.link || row.link;
  const direct = directDocumentIdentity(link) || publicNoticeIdentity(link);
  if (direct) return { sourceId: direct.sourceId, sourceUrl: direct.link };
  const candidate = officialCandidate({...row, link, portalTenderId: input.tenderId || row.portalTenderId});
  if (candidate.ambiguous || !candidate.tenderId || !candidate.sourceId) return null;
  return { sourceId: candidate.sourceId, portalTenderId: candidate.tenderId };
}

export async function findSavedDownload(db, where) {
  if (!where) return null;
  const tender = await db.tender.findFirst({where, select:{id:true, documents:{select:{
    fileName:true, size:true, textStatus:true, extractedText:true, file:{select:{documentId:true}},
  }}}});
  if (!tender) return null;
  const record = tender.documents.find(d=>d.fileName === 'official-record.txt');
  let metadata = {};
  try { metadata = JSON.parse(record?.extractedText || '{}'); } catch { /* Older imports may lack a manifest. */ }
  const names = Array.isArray(metadata.documents) ? metadata.documents.map(d=>d.name) : null;
  const originals = tender.documents.filter(d=>d.fileName !== 'official-record.txt' && (!names || names.includes(d.fileName)));
  // A metadata row alone must never produce a successful "files ready" response.
  if (!originals.length || originals.some(d=>!d.file || !(d.size>0))) {
    const error = new Error('This tender is saved, but its original files are missing. Open the saved tender to upload or restore the files.');
    error.code = 'SAVED_FILES_MISSING';
    throw error;
  }
  const missing = (metadata.documents || []).some(expected => !originals.some(d => d.fileName === expected.name && d.size === expected.size));
  // Check byte lengths in PostgreSQL without transferring every cached PDF to Node.
  const corrupt = typeof db.$queryRawUnsafe === 'function' ? await db.$queryRawUnsafe(
    `SELECT COUNT(*)::int AS count FROM "DeskDocument" d LEFT JOIN "DeskDocumentFile" f ON f."documentId"=d.id WHERE d."tenderId"=$1 AND d."fileName"<>'official-record.txt' AND d."fileName"=ANY($2::text[]) AND (f.bytes IS NULL OR octet_length(f.bytes)=0 OR octet_length(f.bytes)<>d.size)`, tender.id, originals.map(d=>d.fileName)) : [];
  if (missing || Number(corrupt[0]?.count || 0)>0) {
    const error = new Error('Saved official files are incomplete. Open the tender to restore its missing originals.');
    error.code='SAVED_FILES_MISSING'; throw error;
  }
  return {ok:true, tenderId:tender.id, existing:true, documentCount:originals.length,
    message:'Using files already saved on the server. No new download or CAPTCHA was needed.',
    completeness:metadata.evidence?.completeness || (record ? 'listed-official-documents' : 'saved-files'),
    downloadWarnings:(metadata.evidence?.downloads || []).filter(d=>d.status!=='downloaded').map(d=>({url:d.url,reason:d.reason || d.message || 'Not downloaded'})),
    extractionWarnings:originals.filter(d=>d.textStatus!=='TEXT').map(d=>d.fileName),
  };
}
