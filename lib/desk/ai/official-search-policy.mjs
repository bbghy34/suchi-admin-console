import { PORTALS } from '../portal-import/identity.mjs';

const NE_IDS = new Set(['assam','tripura','arunachal','manipur','meghalaya','mizoram','nagaland']);
// A named place outside the Northeast: the first search goes there instead of the Northeast portals.
const OUTSIDE_NE = /\b(?:andhra pradesh|bihar|chhattisgarh|delhi|goa|gujarat|haryana|himachal|jharkhand|karnataka|kerala|madhya pradesh|maharashtra|mumbai|odisha|orissa|punjab|rajasthan|tamil nadu|chennai|telangana|hyderabad|uttar pradesh|uttarakhand|west bengal|kolkata|jammu|kashmir|ladakh|puducherry|chandigarh|bengaluru|bangalore)\b/i;
// Search preferences are not downloader capability declarations. These additional URLs are
// the configured source-register noticeboards; their links still pass retrieval validation.
export const PREFERRED_SEARCH_HOSTS = Object.freeze([...new Set([
  ...PORTALS.map(portal=>portal.host), 'bidplus.gem.gov.in', 'www.sikkim.gov.in',
  'pmgsy.nic.in', 'nbccindia.in', 'nbcc.enivida.com',
])]);
const ALIASES = {
 'assam': /assamtenders|assam\s+(?:state\s+)?(?:procurements?\s+)?portal/i,
 'tripura': /tripuratenders|tripura\s+(?:tenders?\s+)?portal/i,
 'cppp': /\bCPPP\b|central\s+(?:public\s+)?procurements?\s+portal/i,
 'defence': /\bdefence\b|defproc/i,
 'pmgsy': /\bPMGSY\b/i,
 'iocl': /\bIOCL\b|\bIndianOil\b/i,
 'ntpc': /\bNTPC\b/i,
 'coal-india': /\bcoal\s+india\b/i,
 'west-bengal': /west\s+bengal\s+(?:e[ -]?)?procurement/i,
};

export function officialSearchPolicy(query) {
  const text=String(query || '').trim().slice(0,1000);
  const explicit=PORTALS.filter(portal=>text.toLowerCase().includes(portal.host) || ALIASES[portal.id]?.test(text)).map(portal=>portal.host);
  if (/\bGeM\b|government\s+e[ -]?marketplace/i.test(text)) explicit.push('bidplus.gem.gov.in');
  if (/\bNRIDA\b|\bNRRDA\b|national\s+rural\s+(?:roads?|infrastructure)/i.test(text)) explicit.push('pmgsy.nic.in');
  if (/\bNBCC\b/i.test(text)) explicit.push('nbccindia.in','nbcc.enivida.com');
  if (/sikkim\s+(?:tenders?\s+)?portal/i.test(text)) explicit.push('www.sikkim.gov.in');
  const unique=[...new Set(explicit)];
  const ne=PORTALS.filter(portal=>NE_IDS.has(portal.id)).map(portal=>portal.host).concat('www.sikkim.gov.in','bidplus.gem.gov.in');
  const national=PORTALS.filter(portal=>!NE_IDS.has(portal.id)).map(portal=>portal.host).concat('pmgsy.nic.in','nbccindia.in','nbcc.enivida.com');
  const scope=unique.length ? unique.join(', ') : null;
  return {
    explicitHosts: unique,
    instruction: `Preferred official sources: ${PREFERRED_SEARCH_HOSTS.join(', ')}.
Return only tender notices from this preferred set and their official government or PSU original-file mirrors. Do not return commercial aggregators, scraped datasets or unrelated tender sites. These are search targets, not a promise that files are downloadable. GePNIC is the NIC portal family, not a separate tender source. NRIDA/NRRDA notices may point to PMGSY or state bidding portals; OMMAS monitoring records are not tender notices.
${scope ? `The user explicitly requested these sources: ${scope}. Keep all three searches within those sources and their official buyer mirrors for the SAME tender; do not broaden to unrelated portals.` : 'Prioritize all eight Northeast states and GeM bids with a Northeast buyer or consignee, unless the user names another place; then search that place first. Search CPPP, central PSUs, defence, Coal India, IOCL, NTPC, NBCC and West Bengal at all-India scope unless the user specifies a location.'}
The requested work, location, organisation and identifiers always take priority over source preference. Never add unrelated results just to cover every portal. Prefer a matching official tender detail page or original notice file; keep exact Tender ID/reference and source-linked closing date. A noticeboard or search-home page is not a specific tender. State unknown facts as unknown. Never label an official host as having downloadable files without a cited file link.`,
    queries: scope ? [
      `${text}\nFind matching tender notices on ${scope}; exact Tender ID and closing date.`,
      `${text}\nFind the same requested tender category on ${scope}; original NIT or bid PDF, official buyer mirrors only.`,
      `${text}\nCheck ${scope} for relevant open official notices, preserve original identifiers and source URLs.`,
    ] : [
      OUTSIDE_NE.test(text)
        ? `${text}\nFirst search the official state procurement portal and government departments for the place the user named, and GeM bids for that place. Preserve the user's location.`
        : `${text}\nFirst search matching official Northeast state and GeM Northeast notices: ${ne.join(', ')}. Preserve the user's location.`,
      `${text}\nSearch relevant official central/PSU/scheme notices: ${national.join(', ')}. Preserve the user's work and location constraints.`,
      `${text}\nFind matching original NIT/PDF notices linked by the preferred official sources; use their official government/institution/PSU original-file mirrors only if needed; exclude aggregators and scraped datasets.`,
    ],
  };
}
