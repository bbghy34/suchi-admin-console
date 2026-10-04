import { createHash } from 'node:crypto';
import { PORTALS, TENDER_ID } from './identity.mjs';

export const VERIFIED_AVAILABILITY_TTL_MS = 24 * 60 * 60 * 1000;
const PREFIX = 'portalImport:unavailable:';
const key = value => PREFIX + createHash('sha256').update(value).digest('hex');
function normalizedURL(value) {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    url.protocol = 'https:'; url.hash = ''; url.searchParams.delete('session');
    url.searchParams.sort();
    // Portal home/list pages are shared by many tenders, never negative-cache them.
    if (!url.searchParams.has('sp') && !url.searchParams.has('tenderId') && /\/(?:app)?\/?$/.test(url.pathname)) return null;
    return url.href;
  } catch { return null; }
}
function hostFor(row) {
  for (const value of [row.sourceHost, row.link, row.sourceUrl, row.originalUrl, row.resolvedUrl]) {
    try { return new URL(value.includes('://') ? value : `https://${value}`).hostname.toLowerCase(); } catch { /* Try next hint. */ }
  }
  return PORTALS.find(p => p.id === row.sourceId)?.host || null;
}
export function verifiedAvailabilityKeys(row) {
  const host = hostFor(row);
  const id = row.portalTenderId || row.tenderId;
  const keys = [];
  if (host && TENDER_ID.test(id || '')) keys.push(key(`id:${host}:${id.toLowerCase()}`));
  for (const value of [row.link, row.sourceUrl, row.originalUrl, row.resolvedUrl]) {
    const url = normalizedURL(value);
    if (url) keys.push(key(`url:${url}`));
  }
  return [...new Set(keys)];
}

/** Call only after opening this exact tender and observing listed files with no links. */
export async function recordVerifiedUnavailable(db, evidence, { now = Date.now() } = {}) {
  if (evidence.code !== 'SOURCE_DOWNLOAD_UNAVAILABLE' || !TENDER_ID.test(evidence.tenderId || '') || !hostFor(evidence)) return false;
  const keys = verifiedAvailabilityKeys(evidence);
  const value = JSON.stringify({schemaVersion:1,status:'unavailable',sourceHost:hostFor(evidence),tenderId:evidence.tenderId,
    originalUrl:evidence.originalUrl || null,resolvedUrl:evidence.resolvedUrl || null,downloadEnd:evidence.downloadEnd || null,
    checkedAt:new Date(now).toISOString(),expiresAt:new Date(now + VERIFIED_AVAILABILITY_TTL_MS).toISOString()});
  await db.$transaction(keys.map(key => db.setting.upsert({where:{key},create:{key,value},update:{value}})));
  return true;
}
export async function clearVerifiedUnavailable(db, evidence) {
  const keys = verifiedAvailabilityKeys(evidence);
  if (keys.length) await db.setting.deleteMany({where:{key:{in:keys}}});
}
function hasSavedFiles(row) {
  return row.recordKind === 'internal' || row.existing === true || row.savedTenderId || row.existingTenderId ||
    row.hasDocuments === true || row.files?.some(f => f.id && f.fileName !== 'ai-note.txt') ||
    row.documents?.some(f => f.id && (f.file || f.size > 0));
}

/** One batch read; only a fresh authoritative absence hides a discovery row. */
export async function applyVerifiedAvailability(db, rows, { includeClosed = false, now = Date.now() } = {}) {
  const rowsWithKeys = rows.map(row => ({row,keys:hasSavedFiles(row) ? [] : verifiedAvailabilityKeys(row)}));
  const keys = [...new Set(rowsWithKeys.flatMap(item => item.keys))];
  if (!keys.length) return rows;
  let records;
  try { records = await db.setting.findMany({where:{key:{in:keys}},select:{key:true,value:true}}); }
  catch { return rows; } // Cache outages must not make search unavailable.
  const fresh = new Map();
  for (const record of records) {
    try {
      const value = JSON.parse(record.value), checked = Date.parse(value.checkedAt);
      if (value.schemaVersion === 1 && value.status === 'unavailable' && TENDER_ID.test(value.tenderId || '') && Number.isFinite(checked) && checked <= now && now - checked < VERIFIED_AVAILABILITY_TTL_MS) fresh.set(record.key,value);
    } catch { /* Ignore old or malformed cache records. */ }
  }
  return rowsWithKeys.flatMap(({row,keys}) => {
    const exactId = row.portalTenderId || row.tenderId;
    const evidence = keys.map(k => fresh.get(k)).find(value => value && (!TENDER_ID.test(exactId || '') || value.tenderId.toLowerCase() === exactId.toLowerCase()));
    if (!evidence) return [row];
    return includeClosed ? [{...row,verifiedAvailability:{status:'unavailable',checkedAt:evidence.checkedAt,downloadEnd:evidence.downloadEnd,
      message:'The official notice was checked and its download links were unavailable.'}}] : [];
  });
}
