import { preferredDownloadRank } from './preferred-sources.mjs';
import { PORTALS, portalFor } from './identity.mjs';
import { publicNoticeIdentity } from './public-notice.mjs';
import { directDocumentIdentity, officialHost } from './direct-document.mjs';

/** Sites that copy notices from official portals; their files are not official copies. */
export const AGGREGATOR_HOSTS = [
  'asiantender.com', 'bidassist.com', 'tenderkart.in', 'tendersplus.com', 'tenderdetail.com', 'tendershark.com', 'classictenders.net',
  'tenderfiles.com', 'tender247.com', 'tendertiger.com', 'tendersontime.com', 'tendersinfo.com', 'globaltenders.com',
  'tenderimpulse.com', 'etenderwatch.com', 'urbanacres.in', 'biddetail.com', 'indiantenders.com', 'tendernews.com',
];

/** Hosts the desk can retrieve from, for prompts and ranking. */
export const RETRIEVABLE_HOSTS = [...PORTALS.map((p) => p.host), 'bidplus.gem.gov.in', 'www.sikkim.gov.in'];

function hostOf(link) {
  try { return new URL(link).hostname.toLowerCase(); } catch { return ''; }
}

/**
 * Lower rank = shown first.
 * 0 exact detail page on a supported portal (or GeM/Sikkim notice)
 * 1 official file (PDF/DOC/XLS/ZIP) on a government, institution or PSU site
 * 2 other page on a supported portal
 * 3 other official page (may list files)
 * 4 anything else; 5 aggregator copies
 */
export function sourceRank(row = {}) {
  const link = String(row.link || '');
  const docs = Array.isArray(row.documents) ? row.documents.map((d) => d.url) : [];
  const host = hostOf(link);
  const portal = portalFor(link);
  if (publicNoticeIdentity(link)) return { rank: 0, kind: 'notice', retrievable: true };
  if (portal && /\b\d{4}_[A-Za-z0-9]+_\d+_\d+\b/.test(`${row.title || ''} ${row.detail || ''} ${decodeURIComponent(link)}`)) return { rank: 0, kind: 'portal-id', retrievable: true };
  // One tender's own page; organisation and "latest tenders" lists are not.
  if (portal && /[?&]service=direct(?:&|$)/.test(link) && /[?&]sp=/.test(link) && /[?&]page=(?:FrontEndViewTender|WebTenderStatusLists|FrontEndLatestActiveTenders)(?:&|$)/.test(link))
    return { rank: 0, kind: 'portal-detail', retrievable: true };
  if (directDocumentIdentity(link) || docs.some((d) => directDocumentIdentity(d))) return { rank: 1, kind: 'official-file', retrievable: true };
  if (portal) return { rank: 2, kind: 'portal', retrievable: false };
  if (officialHost(host)) return { rank: 3, kind: 'official-page', retrievable: false };
  if (AGGREGATOR_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) return { rank: 5, kind: 'aggregator', retrievable: false };
  return { rank: 4, kind: 'other', retrievable: false };
}

const TENDER_IDS = /\bGEM\/\d{4}\/[A-Z]+\/\d+\b|\b\d{4}_[A-Za-z0-9]+_\d+_\d+\b/gi;
const idsOf = (row) => new Set((`${row.title || ''} ${row.detail || ''} ${row.link || ''}`.match(TENDER_IDS) || []).map((id) => id.toUpperCase()));

/**
 * Stable sort: best sources first, original (relevance) order within a rank.
 * A listing-site copy of a tender already found on its official source is dropped.
 */
export function rankRows(rows = []) {
  const ranked = rows
    .map((row, index) => { const source=sourceRank(row); return {row,index,...source, preference:preferredDownloadRank({...source,host:hostOf(row.link),portalId:portalFor(row.link)?.id})}; })
    .sort((a, b) => a.preference - b.preference || a.rank - b.rank || Number(a.kind==='portal-detail') - Number(b.kind==='portal-detail') || a.index - b.index);
  const official = new Set();
  const out = [];
  for (const item of ranked) {
    const ids = idsOf(item.row);
    if (item.kind === 'aggregator' && [...ids].some((id) => official.has(id))) continue;
    if (item.rank <= 3) ids.forEach((id) => official.add(id));
    out.push({ ...item.row, sourceKind: item.kind, retrievable: item.retrievable });
  }
  return out;
}
