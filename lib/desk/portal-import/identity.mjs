/** Explicit public portal registry. No arbitrary URLs are fetched on the server. */
export const PORTALS = [
  ["assam", "Assam", "assamtenders.gov.in", "Assam"],
  ["tripura", "Tripura", "tripuratenders.gov.in", "Tripura"],
  [
    "arunachal",
    "Arunachal Pradesh",
    "arunachaltenders.gov.in",
    "Arunachal Pradesh",
  ],
  ["manipur", "Manipur", "manipurtenders.gov.in", "Manipur"],
  ["meghalaya", "Meghalaya", "meghalayatenders.gov.in", "Meghalaya"],
  ["mizoram", "Mizoram", "mizoramtenders.gov.in", "Mizoram"],
  ["nagaland", "Nagaland", "nagalandtenders.gov.in", "Nagaland"],
  ["west-bengal", "West Bengal", "wbtenders.gov.in", "West Bengal"],
  ["cppp", "Central procurement", "eprocure.gov.in", null, "/eprocure/app"],
  ["etenders", "Central eTenders", "etenders.gov.in", null, "/eprocure/app"],
  ["pmgsy", "PMGSY", "pmgsytenders.gov.in"],
  ["iocl", "IndianOil", "iocletenders.nic.in"],
  ["ntpc", "NTPC", "eprocurentpc.nic.in"],
  ["coal-india", "Coal India", "coalindiatenders.nic.in"],
  ["defence", "Defence", "defproc.gov.in"],
].map(([id, label, host, state = null, path = "/nicgep/app"]) => ({
  id,
  label,
  host,
  state,
  path,
  base: `https://${host}${path}`,
}));
export const ASSAM_HOST = PORTALS[0].host;
export const ASSAM_BASE = PORTALS[0].base;
export const TENDER_ID = /^\d{4}_[A-Za-z0-9]+_\d+_\d+$/;
export function portalFor(link) {
  try {
    const u = new URL(link);
    if (
      !["https:", "http:"].includes(u.protocol) ||
      u.username ||
      u.password ||
      u.port
    )
      return null;
    return PORTALS.find((p) => p.host === u.hostname) || null;
  } catch {
    return null;
  }
}
// Authority codes route discovery only. The portal must still return the exact ID.
const AUTHORITY_PORTALS = { botc: 'assam', dowr: 'assam', gmc: 'assam', ntpc: 'ntpc', iocl: 'iocl' };
export function officialCandidate(row = {}) {
  const evidence = [row.portalTenderId, row.title, row.detail, row.link].filter(Boolean).join(' ');
  const links = [row.link, ...(Array.isArray(row.documents) ? row.documents.map(d => d.url) : []),
    ...(evidence.match(/https?:\/\/[^\s<>"')]+/gi) || []).map(u => u.replace(/[.,;]+$/, ''))];
  const ids = [...new Set(evidence.match(/\b\d{4}_[A-Za-z0-9]+_\d+_\d+\b/g) || [])];
  const officialLinks = links.filter(link => portalFor(link));
  const explicit = [...new Set(officialLinks.map(link => portalFor(link).id))];
  const authority = ids.length === 1 ? AUTHORITY_PORTALS[ids[0].split('_')[1].toLowerCase()] : null;
  const conflict = explicit.length > 1 || (authority && explicit.length === 1 && authority !== explicit[0]);
  const sourceId = conflict ? '' : explicit[0] || authority || '';
  const portal = PORTALS.find(p => p.id === sourceId);
  const official = officialLinks.find(link => portalFor(link)?.id === sourceId && /[?&]service=direct(?:&|$)/.test(link))
    || officialLinks.find(link => portalFor(link)?.id === sourceId) || portal?.base || '';
  const reference = String(row.reference || evidence.match(/(?:Tender\s+Reference(?:\s+Number)?|Reference\s+No\.?)[\s:]+([A-Za-z0-9][A-Za-z0-9_.()/-]{3,149})/i)?.[1] || '').trim();
  return {
    supported: !!portal, officialLink: official, portal: portal?.label || '', sourceId,
    tenderId: ids.length === 1 ? ids[0] : '', reference,
    ambiguous: ids.length > 1 || !!conflict,
  };
}
export function readyCandidate(candidate) {
  return candidate.supported && !candidate.ambiguous && (candidate.tenderId || candidate.reference ||
    (/[?&]service=direct(?:&|$)/.test(candidate.officialLink) && /[?&]sp=/.test(candidate.officialLink)));
}
export function validateIdentity(
  link,
  tenderId,
  { allowDetailLink = false } = {},
) {
  const portal = portalFor(link);
  if (!portal)
    throw new Error(
      "Choose a supported official procurement portal. Other sources can be uploaded manually.",
    );
  const u = new URL(link);
  const detail =
    allowDetailLink &&
    u.pathname === portal.path &&
    u.searchParams.get("service") === "direct" &&
    u.searchParams.has("sp");
  if (!TENDER_ID.test(tenderId || "") && !(!tenderId && detail))
    throw new Error(
      "Enter the exact government Tender ID, for example 2026_DoWR_54237_1.",
    );
  return {
    sourceId: portal.id,
    tenderId: tenderId || "",
    portal,
    detailLink: detail ? u.href : null,
  };
}
