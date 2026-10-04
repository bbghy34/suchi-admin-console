import { PORTALS } from './identity.mjs';
import { citedClosingStatus } from './search-availability.mjs';
const GENERIC = new Set('assam nagaland government govt official tender tenders bid bids search find show me in for from of the and or with works work civil construction procurement portal current open latest notice notices'.split(' '));
const words = value => (String(value || '').toLowerCase().match(/[a-z0-9]{3,}/g) || []).filter(word=>!GENERIC.has(word));
/** Detail-checked public results still have to satisfy the user's work/location and explicit filters. */
export function matchesLiveSearch(row, query, filters = {}, now=Date.now()) {
  const text=`${row.title || ''} ${row.detail || ''} ${row.state || ''}`.toLowerCase();
  const close=Date.parse(row.closingDate || '');
  const listing = row.discoveryMethod==='official-public-listing' && row.downloadAvailability==='unverified';
  if (!Number.isFinite(close) || close<=now || (row.downloadAvailability!=='available' && !listing)) return false;
  if(filters.has_documents && listing)return false;
  // The parsed deadline is enforced below. Its conversational words are not
  // tender content; retain all other words so specific locations still matter.
  let contentQuery = String(query || '');
  if (filters.closing_within_days != null) contentQuery = contentQuery
    .replace(/\b(?:closing|close|due|ending|ends?)\s+(?:(?:this|next)\s+(?:week|month)|today|tomorrow|soon)\b/gi, ' ')
    .replace(/\b(?:(?:closing|close|due|ending|ends?)\s+)?(?:in|within|over(?: the next)?)\s+(?:the\s+next\s+)?\d+\s+days?\b/gi, ' ')
    .replace(/\b(?:this|next)\s+(?:week|month)\b|\b(?:today|tomorrow)\b/gi, ' ');
  const requested=words(contentQuery);
  if (!requested.length || !requested.every(word=>text.includes(word) || (word.endsWith('s') && text.includes(word.slice(0,-1))))) return false;
  if(filters.states?.length && !filters.states.includes(row.state))return false;
  if(filters.sources?.length && !filters.sources.includes(row.sourceId))return false;
  for(const field of ['department','organization']) if(filters[field] && !text.includes(String(filters[field]).toLowerCase()))return false;
  if(filters.keywords?.length && !filters.keywords.every(word=>!words(word).length || text.includes(String(word).toLowerCase())))return false;
  if(filters.work_categories?.length && !filters.work_categories.some(category=>row.workCategory===category || (category==='Roads and bridges' && /\b(?:roads?|bridges?)\b/i.test(text))))return false;
  if(filters.scheme && !text.includes(String(filters.scheme).toLowerCase()))return false;
  if(filters.category && row.category!==filters.category)return false;
  if(filters.central && ['assam','nagaland'].includes(row.sourceId))return false;
  if(filters.closing_within_days!=null){
    const day=Math.floor((now+330*60000)/86400000);
    const end=(day+Math.max(0,Number(filters.closing_within_days))+1)*86400000-330*60000;
    if(close>=end)return false;
  }
  for(const [name,direction] of [['amount_min',1],['amount_max',-1]])if(filters[name]!=null && filters[name]!==''){
    if(row.estimatedValue==null || !Number.isFinite(Number(row.estimatedValue)) || direction*(Number(row.estimatedValue)-Number(filters[name]))<0)return false;
  }
  // These require fields not yet verified by public keyword discovery; do not silently ignore them.
  if(filters.money || filters.stage || filters.has_experience || filters.has_postponement || filters.has_extension || filters.has_boq || filters.has_pq || filters.has_corrigendum)return false;
  return true;
}
export function mergeLiveSearchRows(verified, cited) {
  const seenLinks=new Set(),seenIds=new Set(),rows=[];
  for(const row of [...verified,...cited]){
    const id=row.portalTenderId || String(row.detail || '').match(/\b\d{4}_[A-Za-z0-9]+_\d+_\d+\b/)?.[0];
    let host;try{host=new URL(row.link).hostname;}catch{continue;}
    const key=id ? `${host}:${id.toUpperCase()}` : null;
    if(seenLinks.has(row.link) || (key && seenIds.has(key)))continue;
    seenLinks.add(row.link);if(key)seenIds.add(key);rows.push(row);
  }
  return rows;
}

export function officialSearchProblem(diagnostics) {
  return !!(diagnostics?.error || diagnostics?.portals?.some(portal=>portal.error));
}
export function officialSearchProblemMessage(hasRows) {
  return hasRows
    ? 'Some official portal checks did not finish. Retrieved results are shown, but the current-notice check is incomplete.'
    : 'The official portal could not complete its current-notice check. This does not mean there are no matching tenders. Please try again shortly.';
}


/** A completed current listing check overrides undated index hits for that same portal only. */
export function preferCheckedPortalListings(rows, diagnostics, {includeClosed=false,now=Date.now()}={}) {
  if(includeClosed)return rows;
  const checkedHosts=new Set((diagnostics?.portals || []).filter(portal=>portal.error===null && portal.requests>=2)
    .map(portal=>PORTALS.find(known=>known.id===portal.sourceId)?.host).filter(Boolean));
  if(!checkedHosts.size)return rows;
  const today=new Date(now+330*60000).toISOString().slice(0,10);
  return rows.filter(row=>{
    let host;try{host=new URL(row.link).hostname;}catch{return false;}
    if(!checkedHosts.has(host) || row.existingTenderId)return true;
    // A fresh official listing/detail date is stronger than an old indexed link.
    if(['official-public-listing','official-public-search'].includes(row.discoveryMethod) && Date.parse(row.closingDate)>now)return true;
    const cited=citedClosingStatus(row,now);
    return !!(cited && cited.date>today);
  });
}
