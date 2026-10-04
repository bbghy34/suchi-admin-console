import { discoverOfficialDocuments } from './page-discovery.mjs';
import { publicNoticeIdentity } from './public-notice.mjs';
import { officialCandidate, readyCandidate } from './identity.mjs';
import { directDocumentIdentity, officialPageUrl } from './direct-document.mjs';

/** Resolve discovery evidence; only allowlisted portals can ever be fetched. */
export async function resolveDiscovery(row, search, { discover = discoverOfficialDocuments, onEvent = () => {}, deadlineAt = Date.now()+45000 } = {}) {
  let discoveryEvidence = null;
  const initial = discoveryCandidate(row);
  if ((initial.publicNotice || readyCandidate(initial))) return { candidate: preferDetail(initial) };
  // An official file linked straight from the result needs no portal session or CAPTCHA.
  // The clicked result is itself the file: download exactly that one.
  if (directDocumentIdentity(row.link)) return { candidate: directChoice(row.link, row.title) };
  const direct = directCandidates(row);
  if (direct.length === 1) return { candidate: direct[0] };
  if (direct.length > 1) return { matches: direct.slice(0, 6) };
  // An official listing page: pick the document whose link text matches this result.
  const page = !initial.supported && officialPageUrl(row.link);
  if (page) {
    const discovery = await discover(page, { title: row.title, detail: row.detail, onEvent, deadlineAt });
    discoveryEvidence = discovery.evidence;
    const docs = discovery.documents;
    const top = docs[0];
    // A single notice row may contain its NIT and BOQ. Keep that bounded packet together.
    const group = top?.group ? docs.filter(d => d.group === top.group) : [];
    const primary = group.filter(d => /\b(?:nit|notice inviting|tender notice)\b/i.test(d.anchorLabel || ''));
    const outside = docs.filter(d => d.group !== top?.group);
    if (top?.score >= 3 && primary.length === 1 && group.length <= 8 && (!outside[0] || outside[0].score <= top.score-2))
      return { candidate: directChoice(primary[0].link, primary[0].label), discoveryEvidence, relatedDocuments:group.filter(d=>d.link!==primary[0].link) };
    if (top && ((top.score >= 3 && (!docs[1] || docs[1].score <= top.score - 2)) || (docs.length === 1 && top.parentScore >= 3)))
      return { candidate: directChoice(top.link, top.label), discoveryEvidence };
    const strong = docs.filter(d => d.score >= 2 || d.parentScore >= 3).slice(0, 6);
    if (strong.length) return { matches: strong.map(d => ({ ...directChoice(d.link, d.label), evidence: `Linked from ${d.via}` })), discoveryEvidence };
  }
  const query = `Find the exact official procurement notice for this selected result. Return the government Tender ID, tender reference and official detail URL. Prefer the official e-procurement portal detail page or the tender's own PDF on the official website over aggregator copies. Do not substitute another project. Title: ${String(row.title || '').slice(0, 500)}. Source: ${String(row.link || '').slice(0, 700)}. Evidence: ${String(row.detail || '').slice(0, 1800)}`;
  const found = await search(query);
  const choices = new Map();
  for (const hit of found.rows || []) {
    const candidate = discoveryCandidate(hit);
    if (!(candidate.publicNotice || readyCandidate(candidate))) {
      if (initial.tenderId || initial.sourceId) continue;
      for (const doc of directCandidates(hit)) choices.set(`direct:${doc.officialLink}`, { ...doc, title: hit.title || doc.title, evidence: String(hit.detail || '').slice(0, 500) });
      continue;
    }
    if (initial.tenderId && candidate.tenderId !== initial.tenderId) continue;
    if (initial.sourceId && candidate.sourceId !== initial.sourceId) continue;
    const key = `${candidate.sourceId}:${candidate.tenderId || candidate.reference || candidate.officialLink}`;
    choices.set(key, { ...candidate, title: hit.title, evidence: String(hit.detail || '').slice(0, 500) });
  }
  const matches = [...choices.values()].slice(0, 6);
  // A known exact ID can be resolved automatically. Title-only discovery needs
  // the person to choose a named result; never silently download a different job.
  if (initial.tenderId && matches.length === 1) return { candidate: preferDetail(matches[0]) };
  return { matches, discoveryEvidence };
}

function preferDetail(candidate) {
  // A supplied detail page can be checked without a paid reference-search CAPTCHA.
  return /[?&]service=direct(?:&|$)/.test(candidate.officialLink) && /[?&]sp=/.test(candidate.officialLink)
    ? { ...candidate, reference: '' } : candidate;
}

function discoveryCandidate(row = {}) {
  const candidates = [row.link, ...(Array.isArray(row.documents) ? row.documents.map(d => d.url) : [])]
    .map(publicNoticeIdentity).filter(Boolean);
  const unique = [...new Map(candidates.map(c => [c.link, c])).values()];
  if (unique.length === 1) {
    const c = unique[0];
    return { supported: true, publicNotice: true, sourceId: c.sourceId, officialLink: c.link,
      portal: c.portal.label, tenderId: '', reference: '', ambiguous: false };
  }
  return officialCandidate(row);
}

function directChoice(link, title = '') {
  const id = directDocumentIdentity(link);
  return { supported: true, direct: true, sourceId: id.sourceId, officialLink: id.link, portal: `Official file · ${id.host}`,
    tenderId: '', reference: '', ambiguous: false, title: title || id.link.split('/').pop(), evidence: '' };
}

function directCandidates(row = {}) {
  const links = [row.link, ...(Array.isArray(row.documents) ? row.documents.map(d => d.url) : [])];
  const seen = new Set();
  return links.map(directDocumentIdentity).filter(Boolean).filter(id => !seen.has(id.link) && seen.add(id.link))
    .map(id => directChoice(id.link, row.title));
}
