import { portalFor } from './identity.mjs';
import { PREFERRED_SEARCH_HOSTS } from '../ai/official-search-policy.mjs';
import { officialHost } from './direct-document.mjs';
import { citedClosingStatus } from './search-availability.mjs';
const STATE_SITES = ['assam.gov.in','arunachalpradesh.gov.in','manipur.gov.in','meghalaya.gov.in','mizoram.gov.in','nagaland.gov.in','sikkim.gov.in','tripura.gov.in','wb.gov.in'];
const PUBLIC_PSU_SITES = ['ccl.gov.in','npcc.gov.in'];
/** Apply the requested source boundary to both live and previously stored search hits. */
export function preferredOfficialResult(row = {}) {
  let url;
  try { url=new URL(row.link); } catch { return false; }
  if (!['http:','https:'].includes(url.protocol) || url.username || url.password || url.port) return false;
  const host=url.hostname.toLowerCase();
  if (portalFor(row.link)) {
    const exactId = /\b\d{4}_[A-Za-z0-9]+_\d+_\d+\b/.test(`${row.portalTenderId || ''} ${row.title || ''} ${row.detail || ''}`);
    const detail = url.searchParams.get('service')==='direct' && url.searchParams.has('sp') && ['FrontEndViewTender','WebTenderStatusLists','FrontEndLatestActiveTenders'].includes(url.searchParams.get('page'));
    if (!exactId && !detail) return false;
  }
  const under = parent => host===parent || host.endsWith(`.${parent}`);
  if (PREFERRED_SEARCH_HOSTS.some(under) || STATE_SITES.some(under) || PUBLIC_PSU_SITES.some(under) || under('gem.gov.in')) return true;
  // Reuse the downloader's explicit corporate PSU registry; do not admit arbitrary .com mirrors.
  if (!/\.(?:gov|nic|ac|edu|res|mil)\.in$/.test(host) && officialHost(host)) return true;
  // A government/institution buyer may publish its own exact GeM bid outside the portal.
  return officialHost(host) && /\bGEM\/\d{4}\/[A-Z]+\/\d+\b/i.test(`${row.title || ''} ${row.detail || ''}`);
}
export function filterPreferredSearchResults(rows, {includeClosed=false, now=Date.now()}={}) {
  return rows.filter(row=>preferredOfficialResult(row) && (includeClosed || !citedClosingStatus(row,now)?.past));
}
