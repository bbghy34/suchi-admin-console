import { load } from 'cheerio';
import { AssamPortal, parseDetails, assertDownloadAvailable } from './assam.mjs';
import { PORTALS, TENDER_ID } from './identity.mjs';
import { portalDate } from './store.mjs';

const TTL = 15 * 60 * 1000;
const sharedCache = new Map(), inFlight = new Map();
const transportCode = error => {
  const code = error?.cause?.code || error?.code;
  return typeof code === 'string' && /^[A-Z0-9_]{1,48}$/.test(code) ? code : null;
};
const transportFailure = error => !!transportCode(error) && /^(?:ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|EPIPE|UND_ERR_(?:CONNECT_TIMEOUT|HEADERS_TIMEOUT|BODY_TIMEOUT|SOCKET))$/.test(transportCode(error)) || (error instanceof TypeError && /fetch failed/i.test(error.message));
const clean = value => String(value || '').replace(/\s+/g, ' ').trim();

export function liveSearchTargets(query, states = []) {
  const text = `${query} ${Array.isArray(states) ? states.join(' ') : ''}`;
  if (/\b(?:gem|government e.?marketplace)\b/i.test(query)) return [];
  return PORTALS.filter(portal => ['assam', 'nagaland'].includes(portal.id) && new RegExp(`\\b${portal.state}\\b`, 'i').test(text)).slice(0, 2);
}
export function liveSearchKeyword(query) {
  // Prefer the specific procurement category over broad work/supply wording.
  if (/\b(?:furniture|furnishing|furnishings|chairs?|desks?|tables?|benches|beds?)\b/i.test(query)) return 'furniture';
  if (/\b(?:solar|photovoltaic|pv)\b/i.test(query)) return 'solar';
  if (/\b(?:water|drinking|pipeline|pipelines|sewerage|sewage)\b/i.test(query)) return 'water';
  if (/\b(?:equipment|equipments|apparatus|instruments?|computers?|electronic|electronics)\b/i.test(query)) return 'equipment';
  if (/\b(?:road|roads|bridge|bridges|highway)\b/i.test(query)) return 'road';
  if (/\b(?:construction|building|buildings|civil)\b/i.test(query)) return 'construction';
  return null;
}

export function publicKeywordForm(html, portal, keyword) {
  const $ = load(html), form = $('input[name="SearchDescription"]').closest('form');
  if (form.length !== 1 || form.find('img#captchaImage,input[name="captchaText"]').length) return null;
  const action = new URL(form.attr('action') || portal.base, portal.base);
  if (action.origin !== new URL(portal.base).origin || action.pathname !== portal.path) return null;
  const fields = {};
  form.find('input[name]').each((_, input) => {
    const el = $(input), type = (el.attr('type') || 'text').toLowerCase();
    if (el.is('[disabled]') || ['file','password','checkbox','radio','button','image'].includes(type)) return;
    if (type === 'submit' && el.attr('name') !== 'Go') return;
    fields[el.attr('name')] = el.attr('value') || '';
  });
  fields.SearchDescription = keyword; fields.Go ||= 'Go';
  return { action: action.href, fields };
}

export function publicSearchCandidates(html, portal, keyword) {
  const $ = load(html), seen = new Set(), result = [];
  $('a[href]').each((_, anchor) => {
    const a = $(anchor), title = clean(a.text()), rowText = clean(a.closest('tr').text());
    let url; try { url = new URL(a.attr('href'), portal.base); } catch { return; }
    if (url.origin !== new URL(portal.base).origin || url.pathname !== portal.path || url.searchParams.get('service') !== 'direct' || !url.searchParams.has('sp')) return;
    if (!title || !new RegExp(`\\b${keyword}s?\\b`, 'i').test(rowText) || seen.has(url.href)) return;
    seen.add(url.href);
    const cells = a.closest('tr').children('td').toArray().map(cell => clean($(cell).text()));
    const headers = a.closest('table').find('tr').first().children('th,td').toArray().map(cell => clean($(cell).text()));
    const closingIndex = headers.findIndex(label => /^Closing Date$/i.test(label));
    const organisationIndex = headers.findIndex(label => /^Organisation Chain$/i.test(label));
    const closingText = closingIndex >= 0 ? cells[closingIndex] : null;
    const closing = portalDate(closingText);
    const id = rowText.match(/\b\d{4}_[A-Za-z0-9]+_\d+_\d+\b/)?.[0];
    const brackets = [...rowText.matchAll(/\[([^\]]+)\]/g)].map(match => match[1]);
    const reference = brackets.find(value => value !== brackets[0] && value !== id) || '';
    result.push({ link: url.href, title: brackets[0] || title, detail: rowText.slice(0, 1800), portalTenderId: id, reference, closingDate: closing?.toISOString() || null, closingText, organisation: organisationIndex >= 0 ? cells[organisationIndex] : null });
  });
  return result.slice(0, 12);
}

/** Current public keyword search without CAPTCHA or model calls. Listing dates
 * and IDs survive slow detail checks; download availability is a separate fact. */
export async function searchLiveOfficial(query, {
  states = [], deadlineMs = 90000, fetchImpl = fetch,
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms)), now = Date.now,
  cache = sharedCache, inflight = inFlight,
} = {}) {
  const started = now(), keyword = liveSearchKeyword(query), targets = liveSearchTargets(query, states);
  if (!keyword || !targets.length) return { rows: [], diagnostics: { skipped: true, elapsedMs: 0 } };
  const deadline = started + Math.max(1000, Math.min(120000, deadlineMs));
  const budget = { details: 3 };
  const outcomes = await Promise.all(targets.map(async portal => {
    const key = `${portal.id}:${keyword}`, hit = cache.get(key);
    if (hit && hit.expires > now()) return { ...hit.value, cached: true };
    if (inflight.has(key)) return inflight.get(key);
    const pending = (async () => {
      const rows = [], diagnostic = { sourceId: portal.id, requests: 0, checked: 0, searchRetries: 0, transportErrors: [], errorCode: null, error: null };
      const client = new AssamPortal({ portal, deadlineMs: Math.max(1000, deadline - now()), now, sleep,
        fetchImpl: async (url, options) => {
          if (now() >= deadline || diagnostic.requests >= 5) throw Error('Public search request budget reached');
          diagnostic.requests++;
          return fetchImpl(url, { ...options, signal: AbortSignal.any([options.signal, AbortSignal.timeout(Math.max(1, deadline - now()))]) });
        },
      });
      try {
        const home = await client.page(portal.base), form = publicKeywordForm(home, portal, keyword);
        if (!form) throw Error('Public keyword form unavailable');
        let listing;
        try { listing = await client.page(form.action, form.fields); }
        catch (error) {
          // This form only searches public records. Retry its transport failure
          // once; never replay CAPTCHA, downloads, HTTP cooldowns or mutations.
          if (!transportFailure(error) || diagnostic.requests >= 5 || now() + 2100 >= deadline) throw error;
          diagnostic.transportErrors.push(transportCode(error) || 'FETCH_FAILED');
          diagnostic.searchRetries = 1;
          await client.wait(2000);
          listing = await client.page(form.action, form.fields);
        }
        const candidates = publicSearchCandidates(listing, portal, keyword);
        for (const candidate of candidates) {
          if (!candidate.portalTenderId || !candidate.closingDate || Date.parse(candidate.closingDate) <= now()) continue;
          rows.push({ ...candidate, sourceId: portal.id, state: portal.state, site: portal.host,
            detail: [`State: ${portal.state}`, `Work Description: ${candidate.title}`, `Tender ID: ${candidate.portalTenderId}`, `Tender Reference No: ${candidate.reference}`, `Closing Date: ${candidate.closingText}`, `Issuing Authority: ${candidate.organisation || ''}`, 'Current official listing; file availability has not been checked.'].join('\n'),
            verifiedAvailability: 'unverified', downloadAvailability: 'unverified', verifiedAt: new Date(now()).toISOString(), discoveryMethod: 'official-public-listing' });
        }
        for (const candidate of candidates) {
          if (targets.length > 1 && diagnostic.checked >= 1) break;
          if (budget.details <= 0 || now() + 2100 >= deadline) break;
          budget.details--; diagnostic.checked++;
          const html = await client.page(candidate.link), details = parseDetails(html), fields = details.fields;
          if (!TENDER_ID.test(fields['Tender ID'] || '') || (candidate.portalTenderId && fields['Tender ID'] !== candidate.portalTenderId)) continue;
          const prior = rows.findIndex(row => row.portalTenderId === fields['Tender ID']);
          if (prior >= 0) rows.splice(prior, 1);
          const close = portalDate(fields['Bid Submission End Date']);
          if (!close || close.getTime() <= now()) continue;
          if (!new RegExp(`\\b${keyword}s?\\b`, 'i').test(`${fields.Title} ${fields['Work Description']}`)) continue;
          // A sequenced listing link must still describe the selected result.
          const tokens = clean(candidate.title).toLowerCase().match(/[a-z0-9]{4,}/g) || [];
          const opened = `${fields.Title} ${fields['Work Description']} ${fields['Tender Reference Number']}`.toLowerCase();
          if (tokens.length && !tokens.some(token => opened.includes(token))) continue;
          let available = false;
          if (details.manifest.length) try { assertDownloadAvailable(html, details); available = true; } catch {}
          rows.unshift({ title: fields.Title || fields['Work Description'], link: candidate.link,
            detail: [`State: ${portal.state}`, `Work Description: ${fields['Work Description'] || fields.Title}`, `Tender ID: ${fields['Tender ID']}`, `Tender Reference No: ${fields['Tender Reference Number'] || ''}`, `Closing Date: ${fields['Bid Submission End Date']}`, `Issuing Authority: ${fields['Organisation Chain'] || ''}`, `Location: ${fields.Location || portal.state}`, ...(fields['Tender Value in ₹'] ? [`Estimated Value: ₹${fields['Tender Value in ₹']}`] : []), ...(fields['EMD Amount in ₹'] ? [`EMD: ₹${fields['EMD Amount in ₹']}`] : []), available ? 'Official page currently offers document download links; CAPTCHA may be required.' : 'Official page currently has no supported download links.'].join('\n'),
            portalTenderId: fields['Tender ID'], reference: fields['Tender Reference Number'] || '',
            sourceId: portal.id, state: portal.state, site: portal.host, closingDate: close.toISOString(),
            organisation: fields['Organisation Chain'] || null, category: fields['Tender Category'] || null,
            workCategory: fields['Product Category'] || null,
            estimatedValue: fields['Tender Value in ₹'] ? Number(fields['Tender Value in ₹'].replaceAll(',', '')) || null : null,
            documentTypes: [...new Set(details.manifest.map(doc => doc.type))],
            verifiedAvailability: available ? 'available' : 'unavailable', downloadAvailability: available ? 'available' : 'unavailable',
            verifiedAt: new Date(now()).toISOString(), discoveryMethod: 'official-public-search',
          });
        }
      } catch (error) { diagnostic.error = error.message; diagnostic.errorCode = transportCode(error); if (diagnostic.errorCode) diagnostic.transportErrors.push(diagnostic.errorCode); }
      const value = { rows, diagnostic };
      // Cache unsuccessful searches briefly to avoid repeated portal traffic.
      cache.set(key, { value, expires: now() + (diagnostic.error && !rows.length ? 60000 : TTL) });
      if (cache.size > 32) cache.delete(cache.keys().next().value);
      return value;
    })();
    inflight.set(key, pending);
    try { return await pending; } finally { inflight.delete(key); }
  }));
  return { rows: outcomes.flatMap(result => result.rows).filter(row => Date.parse(row.closingDate) > now()).sort((a,b) => Number(b.verifiedAvailability === 'available') - Number(a.verifiedAvailability === 'available')).slice(0, 6), diagnostics: { elapsedMs: now() - started, portals: outcomes.map(result => ({ ...result.diagnostic, cached: !!result.cached })) } };
}
