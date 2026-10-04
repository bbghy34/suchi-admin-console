import { preferredOfficialResult } from '../portal-import/preferred-search-results.mjs';
import { officialSearchPolicy } from './official-search-policy.mjs';
import { createSearchWorkCache, uniqueCitedHits, isGroundingRedirect } from './search-work-cache.mjs';
import { matchesRequestedPortal } from '../portal-import/search-scope.mjs';
import { geminiGrounded, usableGeminiKey } from './gemini';
import { PORTALS } from '../portal-import/identity.mjs';
import { rankRows } from '../portal-import/source-rank.mjs';

/**
 * Public pages Gemini's web search actually cited for this query.
 * A row exists only when Google returned a link. Eligibility and files stay
 * "Not Available" unless that same page is what the model cited for them.
 */
const PORTAL_HOSTS = PORTALS.map((p) => p.host).join(', ');
const SYSTEM = `Find public Indian tender notices that match the user's words.
Search the official portals first and cite them first. Retrieval uses specialized portal handlers and validated public-document discovery for:
1. NIC eProcurement portals: ${PORTAL_HOSTS}. Cite the tender's own detail page and keep its Tender ID (like 2026_PWD_12345_1).
2. GeM bid documents on bidplus.gem.gov.in (Northeast buyers or consignees first, others when the query names another place) and Sikkim notices on www.sikkim.gov.in/tender.
3. The tender's own notice file (PDF, DOC, XLS or ZIP) on a government, institution or PSU website (.gov.in, .nic.in, .ac.in, .edu.in, .res.in, or the PSU's own domain). Cite the file link itself when you find it.
Only when none of those exist, cite another official page. Avoid copies on tender aggregator sites (bidassist, tenderkart, tendersplus, tenderdetail, tendershark, tender247, tendertiger, classictenders, tenderfiles).
Prefer open tenders with a closing date in the future. For each tender, state its title, Tender ID or NIT number, organisation, place of work (district and state), estimated value if published, closing date, and the exact link.
List every matching notice you find; do not narrow by region, value, or category unless the user's words ask for it. Rank Northeast state portals, GeM for a Northeast consignee, Assam, Tripura, CPPP, defence, PMGSY, NRIDA, central PSUs, Coal India, IOCL, NTPC, NBCC, and West Bengal first.
Use all-India coverage for CPPP, defence, central PSUs, Coal India, IOCL, NTPC and NBCC unless the query specifies a location.
Answer only from the pages you were shown. Do not invent a tender, file, amount, or date.`;

// Public results only: retain successful answers for 15 minutes and share in-flight work.
const reuseSearch = createSearchWorkCache({ ttlMs: 15 * 60 * 1000, cacheable: result => result.rows.length > 0 });
const reuseRedirect = createSearchWorkCache({ ttlMs: 15 * 60 * 1000, maxEntries: 500, cacheable: link => !isGroundingRedirect(link) });

export async function onlineTenderSearch(query) {
  const text = String(query || '').trim();
  if (text.length < 3) return { rows: [], note: '' };
  const key = text.toLowerCase().replace(/\s+/g, ' ');
  return reuseSearch(key, () => searchOnline(text));
}

async function searchOnline(text) {
  const key = usableGeminiKey(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);
  if (!key) return { rows: [], note: 'Gemini is not configured, so there is no online result.' };

  const policy = officialSearchPolicy(text);
  const system = `${SYSTEM}\n${policy.instruction}\nToday is ${new Date().toISOString().slice(0,10)}. For a GeM-only request, return GeM bids or their official buyer mirrors only; preserve explicitly combined portal requests. Exclude expired notices unless the user explicitly requests historical tenders.`;
  const ground = (user) => geminiGrounded({ apiKey: key, system, user });
  // Grounded search is billed per Google query. The first two phrasings
  // (official portals and central/PSU sources) usually find everything; the
  // third (original-file mirrors) runs only when they come back thin.
  const [primary, ...extra] = [policy.queries.slice(0, 2), policy.queries.slice(2)];
  let runs = await Promise.all(primary.map(ground));
  let rows = await citedRows(text, runs);
  if (rows.length < ENOUGH_ROWS && extra[0]?.length) {
    runs = [...runs, ...(await Promise.all(extra[0].map(ground)))];
    rows = await citedRows(text, runs);
  }
  if (!rows.length && !runs.some((run) => run.chunks.length)) {
    const error = runs.find((run) => run.error)?.error;
    return { rows: [], note: error || 'No public page was cited for this search. Nothing was added.' };
  }
  return {
    rows,
    note: 'Preferred official sources are searched first. Each notice and its file availability are checked when you retrieve it.',
  };
}

/** Enough preferred official notices that a third grounded search would not add much. */
const ENOUGH_ROWS = 6;

async function citedRows(text, runs) {
  const hits = runs.flatMap((run) => run.chunks.map((chunk, index) => ({ chunk, cited: citedText(chunk.originalChunkIndex ?? index, run.supports) })));
  if (!hits.length) return [];
  const resolved = await Promise.all(
    uniqueCitedHits(hits).map(async ({ chunk, cited }) => {
      const link = await publicLink(chunk.uri);
      return {
        title: cleanTitle(chunk.title, link, cited),
        site: siteName(link, chunk.title),
        link,
        detail: cited,
        eligibility: eligibilityFromCited(cited),
        documents: documentsFromCited(cited),
      };
    })
  );
  const merged = new Map();
  for (const row of resolved) {
    if (/vertexaisearch\.cloud\.google\.com/i.test(row.link)) continue;
    const key = row.link; // URL paths and signed query values can be case-sensitive.
    const prior = merged.get(key);
    // The same page cited by several phrasings keeps the richest cited text.
    if (!prior) merged.set(key, row);
    else merged.set(key, { ...(row.detail.length > prior.detail.length ? row : prior), documents: [...new Map([...prior.documents, ...row.documents].map((d) => [d.url, d])).values()].slice(0, 6) });
  }
  return rankRows([...merged.values()].filter(row => preferredOfficialResult(row) && matchesRequestedPortal(text, row))).slice(0, 25);
}

function cleanTitle(title, link, cited = '') {
  const text = String(title || '').trim();
  const generic = !text || /^[\w.-]+\.[a-z]{2,}$/i.test(text) || /vertexaisearch\.cloud\.google\.com/i.test(text);
  if (!generic) return text;
  const named = String(cited).replace(/[*`]/g,'').match(/(?:Tender\s+)?(?:Title|Name of (?:the )?Work|Work Description)\s*:\s*(.{12,300}?)(?=\s+(?:Tender ID|Tender Reference|Reference No|Closing Date|Bid Submission|Organisation|Organization|EMD)\s*:|[\n]|$)/i)?.[1]?.trim();
  if (named) return named;
  return siteName(link, '') || 'Tender page';
}

function siteName(link, fallback) {
  try {
    return new URL(link).hostname.replace(/^www\./, '');
  } catch {
    const text = String(fallback || '').trim();
    return text && !text.includes(' ') ? text : '';
  }
}

async function publicLink(uri) {
  const raw = String(uri || '').trim();
  if (!isGroundingRedirect(raw)) return raw;
  return reuseRedirect(raw, () => resolvePublicLink(raw));
}

async function resolvePublicLink(raw) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const res = await fetch(raw, { method: 'GET', redirect: 'manual', signal: controller.signal });
    const location = res.headers.get('location');
    // The redirect response body is unused; release the connection immediately.
    await res.body?.cancel();
    if (location && /^https?:\/\//i.test(location) && !/vertexaisearch\.cloud\.google\.com/i.test(location)) {
      return location;
    }
  } catch {
    /* keep the cited address behind the title */
  } finally {
    clearTimeout(timer);
  }
  return raw;
}

function detailFromCited(cited) {
  const text = String(cited || '').replace(/\s+/g, ' ').trim();
  if (text.length < 24) return '';
  return text.length > 320 ? `${text.slice(0, 317)}…` : text;
}

function citedText(chunkIndex, supports) {
  return (supports || [])
    .filter((support) => (support.groundingChunkIndices || []).includes(chunkIndex))
    .map((support) => String(support.segment?.text || '').trim())
    .filter(Boolean)
    .join(' ')
    .slice(0, 12000);
}

function eligibilityFromCited(cited) {
  if (!cited || !/eligib|pre-?qual|contractor class|turnover|experience/i.test(cited)) return '';
  return cited.length > 320 ? `${cited.slice(0, 317)}…` : cited;
}

function documentsFromCited(cited) {
  const found = [];
  const pattern = /https?:\/\/[^\s)]+/gi;
  for (const match of String(cited || '').match(pattern) || []) {
    const url = match.replace(/[.,]+$/, '');
    if (!/\.(pdf|docx?|xlsx?|zip)(\?|$)/i.test(url)) continue;
    found.push({ name: url.split('/').pop() || 'Document', url });
  }
  return [...new Map(found.map((d) => [d.url, d])).values()].slice(0, 6);
}
