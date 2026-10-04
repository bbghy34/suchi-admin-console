import { createHash } from 'node:crypto';
import { load } from 'cheerio';

// Northeast PIN code ranges, for consignee addresses that omit the state name.
const NE_PIN = [[/\b78\d{4}\b/, 'Assam'], [/\b79[0-2]\d{3}\b/, 'Arunachal Pradesh'], [/\b79[34]\d{3}\b/, 'Meghalaya'], [/\b795\d{3}\b/, 'Manipur'], [/\b796\d{3}\b/, 'Mizoram'], [/\b79[78]\d{3}\b/, 'Nagaland'], [/\b799\d{3}\b/, 'Tripura'], [/\b737\d{3}\b/, 'Sikkim']];
const NE = ['Assam', 'Arunachal Pradesh', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Sikkim', 'Tripura'];
const PORTALS = {
  gem: { id: 'gem', label: 'Government e-Marketplace', base: 'https://bidplus.gem.gov.in/' },
  sikkim: { id: 'sikkim', label: 'Government of Sikkim', state: 'Sikkim', base: 'https://www.sikkim.gov.in/' },
};
export class PublicNoticeError extends Error {
  constructor(message, code = 'PUBLIC_NOTICE_FAILED', details = {}) {
    super(message); this.name = 'PublicNoticeError'; this.code = code; this.status = 422; Object.assign(this, details);
  }
}
export function publicNoticeIdentity(link) {
  try {
    const u = new URL(link);
    if (u.protocol !== 'https:' || u.username || u.password || u.port || u.hash) return null;
    if (u.search && !(u.hostname === 'www.sikkim.gov.in' && [...u.searchParams.keys()].every(k => k === 'Tender') && u.searchParams.getAll('Tender').length === 1)) return null;
    u.search = '';
    let sourceId, match;
    if (u.hostname === 'bidplus.gem.gov.in' && (match = /^\/showbidDocument\/(\d{1,12})\/?$/.exec(u.pathname))) sourceId = 'gem';
    if (u.hostname === 'www.sikkim.gov.in' && (match = /^\/tender\/tender-info\/(\d{1,12})\/?$/.exec(u.pathname))) sourceId = 'sikkim';
    return sourceId ? { sourceId, portal: PORTALS[sourceId], noticeId: match[1], link: u.href } : null;
  } catch { return null; }
}
export function normalizePublicDocument(raw, sourceId) {
  try {
    const u = new URL(raw);
    if (sourceId === 'sikkim' && u.protocol === 'https:' && ['sikkim.gov.in','www.sikkim.gov.in'].includes(u.hostname) && !u.username && !u.password && !u.port && !u.search && !u.hash && /^\/+uploads\/+tenders\/+[^/]+\.pdf$/i.test(u.pathname)) {
      u.hostname = 'www.sikkim.gov.in'; u.pathname = u.pathname.replace(/\/+/g,'/');
    }
    return u.href;
  } catch { return raw; }
}
export function allowedPublicDocument(raw, sourceId) {
  try {
    const u = new URL(normalizePublicDocument(raw, sourceId));
    if (u.protocol !== 'https:' || u.username || u.password || u.port || u.hash) return false;
    if (sourceId === 'sikkim') return u.hostname === 'www.sikkim.gov.in' && /^\/uploads\/tenders\/[^/]+\.pdf$/i.test(u.pathname) && !u.search;
    if (sourceId !== 'gem') return false;
    if (u.hostname === 'mkp.gem.gov.in') return !u.search && /^\/catalog_data\/catalog_support_document\/buyer_documents\/(?:[A-Za-z0-9_-]+\/)+[A-Za-z0-9_.-]+\.pdf$/i.test(u.pathname);
    if (u.hostname === 'assets-bg.gem.gov.in') return !u.search && /^\/resources\/upload\/shared_doc\/gtc\/[A-Za-z0-9_.-]+\.pdf$/.test(u.pathname);
    if (u.hostname === 'bidplus.gem.gov.in') return !u.search && (/^\/showbidDocument\/\d{1,12}\/?$/.test(u.pathname) || /^\/bidding\/bid\/showCatalogue\/[A-Za-z0-9_/-]+$/.test(u.pathname));
    if (u.hostname === 'fulfilment.gem.gov.in' && u.pathname === '/contract/slafds') return [...u.searchParams.keys()].every(k => k === 'fileDownloadPath') && u.searchParams.getAll('fileDownloadPath').length === 1 && /^\/?[A-Za-z0-9_@./-]+$/.test(u.searchParams.get('fileDownloadPath')) && !u.searchParams.get('fileDownloadPath').split('/').includes('..');
    return u.hostname === 'admin.gem.gov.in' && u.pathname === '/apis/v1/gtc/pdfByDate/' && [...u.searchParams.keys()].every(k => k === 'date') && u.searchParams.getAll('date').length === 1 && /^(?:\d{8}|\d{4}-\d{2}-\d{2})$/.test(u.searchParams.get('date'));
  } catch { return false; }
}
const clean = s => String(s || '').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '').replace(/\s+/g, ' ').trim();
function dateValue(day, month, year, hour, minute) {
  if (+month < 1 || +month > 12 || +day < 1 || +day > new Date(Date.UTC(+year, +month, 0)).getUTCDate() || +hour > 23 || +minute > 59) return null;
  return `${day.padStart(2,'0')}-${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][+month-1]}-${year} ${String(+hour%12 || 12).padStart(2,'0')}:${minute} ${+hour>=12?'PM':'AM'}`;
}
export function parseGemNotice(text) {
  const t = clean(text), fields = {};
  fields['Tender ID'] = t.match(/\bGEM\/\d{4}\/[A-Z]+\/\d+\b/)?.[0];
  const deadline = t.match(/Bid End Date\/Time\s+(\d{2})-(\d{2})-(\d{4})\s+(\d{2}):(\d{2})(?::\d{2})?/);
  if (deadline) fields['Bid Submission End Date'] = dateValue(...deadline.slice(1));
  const opening = t.match(/Bid Opening\s+Date\/Time\s+(\d{2})-(\d{2})-(\d{4})\s+(\d{2}):(\d{2})(?::\d{2})?/);
  if (opening) fields['Bid Opening Date'] = dateValue(...opening.slice(1));
  // Only the explicitly labelled buyer state qualifies; incidental addresses do not.
  const buyerState = NE.find(s => new RegExp(`Ministry/State Name\\s+${s}(?=\\s|$)`, 'i').test(t));
  // A central buyer (a ministry) qualifies when its consignee address is in the Northeast.
  const consignee = t.match(/Consignees?\s*\/?\s*Reporting\s+Officer[\s\S]{0,4000}/i)?.[0] || '';
  const consigneeState = buyerState ? null : NE.find(s => new RegExp(`\\b${s}\\b`, 'i').test(consignee))
    || NE_PIN.find(([re]) => re.test(consignee))?.[1] || null;
  const state = buyerState || consigneeState;
  if (consigneeState) fields['Consignee State'] = consigneeState;
  fields.Title = t.match(/Item Category\s+([\s\S]+?)(?=[\u0900-\u097f]|Minimum Average|Total Quantity|Bidder Turnover)/)?.[1]?.trim();
  if (fields.Title?.length > 600) fields.Title = null;
  fields['Organisation Chain'] = t.match(/Organisation Name\s+([^\u0900-\u097f]+?)(?=[\u0900-\u097f]|Office Name)/)?.[1]?.trim();
  fields['Tender Reference Number'] = fields['Tender ID'];
  fields['Work Description'] = fields.Title;
  fields['Tender Category'] = 'GeM bid';
  for (const label of ['Ministry/State Name','Department Name','Office Name']) fields[label] = t.match(new RegExp(label.replaceAll('/', '\\/') + '\\s+([^\\u0900-\\u097f]+?)(?=[\\u0900-\\u097f]|$)'))?.[1]?.trim();
  const emd = t.match(/EMD Amount\s+(?:INR\s*|Rs\.?\s*|₹\s*)?([0-9][0-9,]*(?:\.[0-9]+)?)(?=\s|$)/i);
  if (emd) fields['EMD Amount in ₹'] = emd[1].replaceAll(',','');
  const value = t.match(/(?:Estimated Bid Value|Estimated Value)\s+(?:INR\s*|Rs\.?\s*|₹\s*)?([0-9][0-9,]*(?:\.[0-9]+)?)(?=\s|$)/i);
  if (value) fields['Tender Value in ₹'] = value[1].replaceAll(',','');
  return { fields, state: state || null, missing: [!fields['Tender ID'] && 'bid number', !fields.Title && 'title', !fields['Bid Submission End Date'] && 'closing date and time', !state && 'Northeast buyer or consignee state'].filter(Boolean) };
}
export function parseSikkimNotice(text, title, noticeId) {
  const t = clean(text);
  const match = /Last\s*Date\/Time for receipt of bids through e-procurement\s+(\d{2})[/.](\d{2})[/.](\d{4})(?:\s+(?:at\s*)?(\d{1,2}):(\d{2}))?/i.exec(t);
  const fields = { 'Tender ID': `SIKKIM-${noticeId}`, Title: clean(title), 'Work Description': t.slice(0, 20000) };
  if (match?.[4]) fields['Bid Submission End Date'] = dateValue(...match.slice(1));
  return { fields, state: 'Sikkim', closingDateText: match?.[0] || null, missing: [!fields.Title && 'title', !fields['Bid Submission End Date'] && 'unambiguous closing date and time'].filter(Boolean) };
}
async function readPdf(bytes) {
  if (bytes.subarray(0, 5).toString() !== '%PDF-') throw new PublicNoticeError('The portal returned a web page instead of a PDF.', 'INVALID_DOCUMENT');
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), verbosity: 0, isEvalSupported: false }).promise;
  try {
    if (doc.numPages > 300) throw new PublicNoticeError('PDF exceeds 300 pages; use manual intake.', 'LIMIT');
    const texts = [], links = new Set();
    for (let n = 1; n <= doc.numPages; n++) {
      const p = await doc.getPage(n), content = await p.getTextContent();
      texts.push(content.items.map(x => x.str + (x.hasEOL ? '\n' : ' ')).join(''));
      for (const a of await p.getAnnotations()) if (a.url) links.add(a.url);
      p.cleanup();
    }
    return { text: texts.join('\n'), links: [...links], pages: doc.numPages };
  } finally { await doc.destroy(); }
}
export async function retrievePublicNotice(identity, { onEvent = () => {}, fetchImpl = fetch, sleep = ms => new Promise(r => setTimeout(r, ms)), minIntervalMs = 2000, deadlineMs = 240000 } = {}) {
  const canonical = publicNoticeIdentity(identity?.link);
  if (!canonical || canonical.sourceId !== identity.sourceId || canonical.noticeId !== identity.noticeId) throw new PublicNoticeError('Unsupported official notice URL.', 'UNSUPPORTED_URL');
  identity = canonical;
  const budget = Math.min(240000, Math.max(1000, deadlineMs));
  const started = Date.now(), documents = [], outcomes = [], metrics = { requests: 0, bytes: 0 }, maxTotal = 50*1024*1024;
  const emit = message => onEvent({ stage: 'downloading', message });
  const request = async (raw, html = false) => {
    let url = normalizePublicDocument(raw,identity.sourceId);
    for (let hop = 0; hop < 4; hop++) {
      if (!(html && url === identity.link) && !allowedPublicDocument(url, identity.sourceId)) throw new PublicNoticeError('The portal linked an unsupported download URL; open the official notice.', 'UNSAFE_REDIRECT');
      if (metrics.requests >= 20 || Date.now() - started > budget) throw new PublicNoticeError('Official download limit reached; try later or use manual intake.', 'LIMIT');
      if (metrics.requests) await sleep(minIntervalMs);
      metrics.requests++;
      const response = await fetchImpl(url, { redirect: 'manual', signal: AbortSignal.timeout(Math.max(1, Math.min(html ? 30000 : 90000, budget - (Date.now() - started)))), headers: { Accept: html ? 'text/html' : 'application/pdf', 'User-Agent': 'SuchiiTenderDesk/1.0' } });
      if ([301,302,303,307,308].includes(response.status)) { await response.body?.cancel(); const location = response.headers.get('location'); if (!location) throw new PublicNoticeError('Redirect has no destination.', 'DOWNLOAD'); url = normalizePublicDocument(new URL(location,url).href,identity.sourceId); continue; }
      if (!response.ok) { await response.body?.cancel();
        if ([429,503].includes(response.status)) {
          const raw = response.headers.get('retry-after'), secs = Number(raw), parsedDate = Date.parse(raw || '');
          const delay = raw && Number.isFinite(secs) ? Math.max(60000,secs*1000) : Number.isFinite(parsedDate) ? Math.max(60000,parsedDate-Date.now()) : 60000;
          throw new PublicNoticeError('The official portal is busy. Wait before trying again.', 'RATE_LIMITED', {status:429,retryAt:Date.now()+Math.min(delay,86400000)});
        }
        throw new PublicNoticeError(`Official portal returned HTTP ${response.status}. Try later or upload the downloaded file.`, response.status === 429 ? 'RATE_LIMITED' : 'DOWNLOAD', { httpStatus: response.status }); }
      const cap = html ? 3*1024*1024 : 20*1024*1024;
      if (+response.headers.get('content-length') > cap) { await response.body?.cancel(); throw new PublicNoticeError('Official file exceeds download size limit.', 'LIMIT'); }
      const chunks = []; let size = 0;
      for await (const chunk of response.body) { size += chunk.length; metrics.bytes += chunk.length; if (size > cap || metrics.bytes > maxTotal) throw new PublicNoticeError('Official packet exceeds download size limit.', 'LIMIT'); chunks.push(chunk); }
      return Buffer.concat(chunks);
    }
    throw new PublicNoticeError('Too many portal redirects.', 'DOWNLOAD');
  };
  let urls = [identity.link], title = '', htmlText = '';
  if (identity.sourceId === 'sikkim') {
    emit('Opening the official Sikkim notice');
    const $ = load((await request(identity.link, true)).toString()); $('script,style').remove();
    title = $('h1').first().text() || $('title').text(); htmlText = clean($.text());
    urls = [...new Set($('a[href]').toArray().map(a => { try { return normalizePublicDocument(new URL($(a).attr('href'), identity.link).href,identity.sourceId); } catch { return ''; } }).filter(u => allowedPublicDocument(u, 'sikkim')))];
    if (!urls.length) throw new PublicNoticeError('No downloadable official PDF was found. Open the notice and use manual intake.', 'NO_DOCUMENT');
  }
  let primary;
  for (let i = 0; i < urls.length && i < 12; i++) {
    const url = urls[i]; emit(`Downloading official document ${i+1}`);
    try {
      let bytes = await request(url), parsed;
      const catalogue = identity.sourceId === 'gem' && new URL(url).pathname.startsWith('/bidding/bid/showCatalogue/');
      if (catalogue && bytes.subarray(0,5).toString() !== '%PDF-') {
        const originalHash = createHash('sha256').update(bytes).digest('hex');
        const $ = load(bytes.toString()); $('script,style').remove();
        const content = clean($.text());
        if (!/Catalogue values for/i.test(content) || !/Bid Requirement/i.test(content)) throw new PublicNoticeError('Catalogue returned a session page instead of specifications.', 'INVALID_DOCUMENT');
        parsed = { text: content, pages: null, links: [] };
        outcomes.push({url,status:'downloaded',format:'catalogue-text',originalHtmlSha256:originalHash,textCharacters:content.length});
        // Original HTML retained as plain text; never served as active HTML.
        documents.push({name:`catalogue-${identity.noticeId}-${i+1}.txt`,type:'Other',bytes,sha256:originalHash,sourceUrl:url});
        continue;
      }
      parsed = await readPdf(bytes);
      const name = identity.sourceId === 'gem' ? `${i ? 'attachment' : 'bid'}-${identity.noticeId}-${i+1}.pdf` : decodeURIComponent(new URL(url).pathname.split('/').at(-1));
      documents.push({ name: name.replace(/[^A-Za-z0-9_.-]/g,'_'), type: i ? 'Other' : 'NIT', bytes, sha256: createHash('sha256').update(bytes).digest('hex'), sourceUrl: url });
      outcomes.push({ url, status: 'downloaded', pages: parsed.pages, textCharacters: parsed.text.length });
      if (!primary) primary = parsed;
      if (i === 0 && identity.sourceId === 'gem') for (const link of parsed.links) { if (allowedPublicDocument(link,'gem') && !urls.includes(link)) urls.push(link); else if (!urls.includes(link)) outcomes.push({url:link,status:'referenced-not-downloaded',reason:'unsupported attachment or external reference'}); }
    } catch (e) { if (!i) throw e; outcomes.push({ url, status: 'failed', code: e.code || 'DOWNLOAD', message: e.message }); if (e.code === 'RATE_LIMITED') { e.documents = documents; e.downloads = outcomes; throw e; } if (e.code === 'LIMIT') break; }
  }
  for (const url of urls) if (!outcomes.some(o => o.url === url)) outcomes.push({url,status:'not-downloaded',reason:'packet request limit'});
  const parsed = identity.sourceId === 'gem' ? parseGemNotice(primary.text) : parseSikkimNotice(primary.text,title,identity.noticeId);
  const evidence = { schemaVersion: 1, sourceUrl: identity.link, text: primary.text, noticeText: htmlText, downloads: outcomes, completeness: outcomes.some(o => o.status !== 'downloaded') ? 'partial' : 'listed-public-documents', parseResult: parsed };
  if (parsed.missing.length) throw new PublicNoticeError(`Manual intake required: could not verify ${parsed.missing.join(', ')} in the official notice.`, 'MANUAL_INTAKE_REQUIRED', { parseResult: parsed, evidence, documents, metrics });
  return { captureScope: evidence.completeness, portal: { ...identity.portal, state: parsed.state }, sourceUrl: identity.link, fields: parsed.fields, manifest: documents.map(({bytes, ...d}) => d), documents, evidence, metrics, retrievedAt: new Date().toISOString() };
}
