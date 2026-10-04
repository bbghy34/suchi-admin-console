import { createHash } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { load } from 'cheerio';
import { unzipSync } from 'fflate';
import * as XLSX from 'xlsx';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { Readable } from 'node:stream';
import { PublicNoticeError, parseGemNotice, allowedPublicDocument } from './public-notice.mjs';

/**
 * Direct official documents: a tender PDF/DOC/XLS/ZIP served straight from a
 * government or institution website, with no portal session or CAPTCHA.
 * Only official hosts are fetched, every redirect is re-checked, and each
 * file must carry the signature of its type.
 */
export const DIRECT_SOURCE_ID = 'official-site';
const OFFICIAL_SUFFIXES = ['.gov.in', '.nic.in', '.ac.in', '.edu.in', '.res.in', '.mil.in'];
// Central PSUs and bodies whose tender notices live on non-.gov.in domains.
const OFFICIAL_HOSTS = [
  'neepco.co.in', 'nhidcl.com', 'coalindia.in', 'iocl.com', 'ntpc.co.in', 'nbccindia.in', 'nhpcindia.com',
  'powergrid.in', 'oil-india.com', 'ongcindia.com', 'bhel.com', 'gailonline.com', 'bsnl.co.in', 'aai.aero',
  'rites.com', 'ircon.org', 'rvnl.org', 'nlcindia.in', 'sail.co.in', 'hal-india.co.in', 'bel-india.in',
  'nfl.co.in', 'brahmaputracracker.com', 'nrl.co.in', 'hindustancopper.com', 'nmdc.co.in', 'secl-cil.in',
  'mahanadicoal.in', 'ccl.gov.in', 'nclcil.in', 'westerncoal.in', 'easterncoal.nic.in', 'wapcos.co.in',
  'npcc.gov.in', 'hpcl.co.in', 'bharatpetroleum.in', 'cpcb.nic.in', 'kvic.org.in', 'iwai.nic.in',
];
const EXT = /\.(pdf|docx?|xlsx?|zip)$/i;
const MAX_BYTES = 25 * 1024 * 1024;
const NE = ['Arunachal Pradesh', 'Assam', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Sikkim', 'Tripura'];

export function officialHost(hostname) {
  const host = String(hostname || '').toLowerCase().replace(/\.$/, '');
  if (!host || isIP(host)) return false;
  return OFFICIAL_SUFFIXES.some((s) => host.endsWith(s)) || OFFICIAL_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
}

function safeUrl(raw) {
  try {
    const u = new URL(raw);
    if (!['https:', 'http:'].includes(u.protocol) || u.username || u.password || (u.port && !['80', '443'].includes(u.port))) return null;
    if (!officialHost(u.hostname)) return null;
    if (/[\x00-\x1f]/.test(decodeURIComponent(u.pathname + u.search))) return null;
    u.hash = '';
    return u;
  } catch { return null; }
}

/** An official document link (by extension) that can be downloaded without a portal session. */
export function directDocumentIdentity(link) {
  const u = safeUrl(link);
  if (!u) return null;
  const filename = [...u.searchParams].find(([key,value]) => /^(?:filename|file|document|attachment|download)$/i.test(key) && EXT.test(value))?.[1];
  const format = /^(?:pdf|docx?|xlsx?|zip)$/i.test(u.searchParams.get('format') || '');
  const endpoint = /\/(?:download(?:file|document|attachment)?|viewfile|viewdocument|getfile|attachment)(?:\.(?:php|aspx?|jsp))?(?:\/[A-Za-z0-9_-]+)?\/?$/i.test(u.pathname);
  const identifier = [...u.searchParams].some(([key,value]) => /^(?:id|fileid|documentid|tenderid|attachmentid)$/i.test(key) && /^[A-Za-z0-9_-]{1,150}$/.test(value)) || /\/(?:download|viewfile|getfile)\/[A-Za-z0-9_-]+\/?$/i.test(u.pathname);
  if (!EXT.test(decodeURIComponent(u.pathname)) && !filename && !format && !(endpoint && identifier)) return null;
  const host = u.hostname.replace(/^www\./, '');
  return {
    sourceId: DIRECT_SOURCE_ID,
    leaseId: `${DIRECT_SOURCE_ID}:${host}`,
    link: u.href,
    host,
    portal: { id: DIRECT_SOURCE_ID, label: host, base: u.origin },
  };
}

/** An official web page (not a file) that may list the tender's documents. */
export function officialPageUrl(link) {
  const u = safeUrl(link);
  return u && !EXT.test(u.pathname) ? u.href : null;
}

export function privateAddress(ip) {
  const family = isIP(ip);
  if (!family) return true;
  if (family === 6) {
    let v = ip.toLowerCase();
    const dotted = v.match(/(\d+\.\d+\.\d+\.\d+)$/);
    if (dotted) {
      const parts=dotted[1].split('.').map(Number);
      v=v.slice(0,-dotted[1].length)+((parts[0]<<8)|parts[1]).toString(16)+':'+((parts[2]<<8)|parts[3]).toString(16);
    }
    const halves=v.split('::'), left=halves[0]?halves[0].split(':'):[], right=halves[1]?halves[1].split(':'):[];
    const words=(halves.length===2?[...left,...Array(8-left.length-right.length).fill('0'),...right]:left).map(n=>parseInt(n,16));
    if (words.length!==8)return true;
    if (words.slice(0,5).every(n=>n===0) && [0,0xffff].includes(words[5])) {
      const hi=words[6],lo=words[7];return privateAddress(`${hi>>8}.${hi&255}.${lo>>8}.${lo&255}`);
    }
    return (words[0]&0xfe00)===0xfc00 || (words[0]&0xffc0)===0xfe80 || (words[0]&0xff00)===0xff00 || (words[0]===0x2001 && words[1]===0xdb8);
  }
  const [a,b]=ip.split('.').map(Number);
  return a===0||a===10||a===127||(a===169&&b===254)||(a===172&&b>=16&&b<=31)||(a===192&&b===168)||(a===100&&b>=64&&b<=127)||(a===198&&[18,19].includes(b))||(a===192&&b===0)||a>=224;
}

/** Native transport pins the already checked DNS answers while retaining TLS host validation. */
function pinnedOfficialRequest(raw, options, addresses) {
  return new Promise((resolve,reject)=>{
    const url=new URL(raw),transport=url.protocol==='https:'?httpsRequest:httpRequest;
    const request=transport(url,{method:'GET',headers:options.headers,signal:options.signal,
      lookup:(_host,opts,callback)=>{
        const approved=addresses.map(a=>({address:a.address,family:isIP(a.address)}));
        if(opts?.all)callback(null,approved);
        else {const item=approved.find(a=>!opts?.family||a.family===opts.family)||approved[0];callback(null,item.address,item.family);}
      },
    },response=>{
      const headers=new Headers();for(const [key,value] of Object.entries(response.headers))if(value!==undefined)headers.set(key,Array.isArray(value)?value.join(', '):value);
      const noBody=[204,205,304].includes(response.statusCode);
      resolve(new Response(noBody?null:Readable.toWeb(response),{status:response.statusCode,headers}));
      if(noBody)response.resume();
    });
    request.on('error',reject);request.end();
  });
}

/** One deadline includes DNS, redirect spacing, network response and streamed body. */
export async function officialFetch(raw, { accept='*/*', cap=MAX_BYTES, fetchImpl, lookupImpl=lookup, timeoutMs=60000, deadlineAt, sleepImpl=ms=>new Promise(r=>setTimeout(r,ms)), minIntervalMs=2000 } = {}) {
  let url=safeUrl(raw);
  if(!url)throw new PublicNoticeError('Only official government or institution websites can be downloaded.','UNSUPPORTED_URL');
  const end=Math.min(deadlineAt??Infinity,Date.now()+timeoutMs);
  const controller=new AbortController();
  const timeoutError=()=>new PublicNoticeError('The official website did not finish within the download time limit. Try later or upload the file.','TIMEOUT');
  const remaining=end-Date.now();
  if(remaining<=0)throw timeoutError();
  let timer;
  const expired=new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(timeoutError());},remaining);});
  const bounded=work=>Promise.race([work,expired]);
  try {
    for(let hop=0;hop<5;hop++) {
      if(Date.now()>=end)throw timeoutError();
      if(hop)await bounded(sleepImpl(minIntervalMs));
      let addresses;
      try{addresses=await bounded(lookupImpl(url.hostname,{all:true}));}catch(e){if(e.code==='TIMEOUT')throw e;throw new PublicNoticeError('The official website could not be reached. Try later or upload the file.','DOWNLOAD');}
      if(!addresses.length||addresses.some(a=>privateAddress(a.address)))throw new PublicNoticeError('The official website address is not allowed.','UNSAFE_REDIRECT');
      const options={redirect:'manual',signal:controller.signal,headers:{Accept:accept,'User-Agent':'Mozilla/5.0 (compatible; SuchiiTenderDesk/1.0)'}};
      const response=await bounded(fetchImpl ? fetchImpl(url.href,options) : pinnedOfficialRequest(url.href,options,addresses));
      if([301,302,303,307,308].includes(response.status)) {
        void response.body?.cancel().catch(()=>{});
        const location=response.headers.get('location');let next;
        try{next=location&&safeUrl(new URL(location,url).href);}catch{next=null;}
        if(!next)throw new PublicNoticeError('The official website redirected to another site. Open the notice and upload the file.','UNSAFE_REDIRECT');
        url=next;continue;
      }
      if(!response.ok) {
        void response.body?.cancel().catch(()=>{});
        if([429,503].includes(response.status)) {
          const rawRetry=response.headers.get('retry-after');const seconds=Number(rawRetry),date=Date.parse(rawRetry || '');
          const wait=rawRetry&&Number.isFinite(seconds)?seconds*1000:Number.isFinite(date)?date-Date.now():60000;
          throw new PublicNoticeError('The official website is busy. Wait before trying again.','RATE_LIMITED',{status:429,retryAt:Date.now()+Math.max(60000,Math.min(wait,86400000))});
        }
        throw new PublicNoticeError(`The official website returned HTTP ${response.status}. The file may have been removed; open the notice or upload a copy.`,'DOWNLOAD',{httpStatus:response.status});
      }
      if(+response.headers.get('content-length')>cap){void response.body?.cancel().catch(()=>{});throw new PublicNoticeError('The official file exceeds the download size limit. Upload it manually.','LIMIT');}
      const chunks=[];let size=0;
      if(!response.body)throw new PublicNoticeError('The official download was empty.','INVALID_DOCUMENT');
      const reader=response.body.getReader();
      try {
        while(true){const {done,value}=await bounded(reader.read());if(done)break;size+=value.byteLength;if(size>cap)throw new PublicNoticeError('The official file exceeds the download size limit. Upload it manually.','LIMIT');chunks.push(Buffer.from(value));}
      } catch(e){void reader.cancel().catch(()=>{});throw e;} finally{reader.releaseLock();}
      return {bytes:Buffer.concat(chunks),url:url.href,mime:response.headers.get('content-type')||'',requests:hop+1};
    }
    throw new PublicNoticeError('Too many redirects on the official website.','DOWNLOAD');
  } finally {clearTimeout(timer);controller.abort();}
}

/** Detect the real file type from its first bytes; web pages served as ".pdf" are rejected. */
export function sniffDocument(bytes, name) {
  const head = bytes.subarray(0, 8);
  if (head.subarray(0, 5).toString() === '%PDF-') return 'pdf';
  if (head.length >= 4 && ['504b0304','504b0506','504b0708'].includes(head.subarray(0,4).toString('hex'))) {
    try {
      const names=new Set();let count=0;
      unzipSync(bytes,{filter:entry=>{if(++count>3000)throw new Error('Archive entry limit');names.add(entry.name);return false;}});
      if(names.has('[Content_Types].xml')&&names.has('word/document.xml'))return 'docx';
      if(names.has('[Content_Types].xml')&&names.has('xl/workbook.xml'))return 'xlsx';
      return 'zip';
    }catch{return null;}
  }
  if (head.length >= 8 && head.toString('hex') === 'd0cf11e0a1b11ae1') {
    try {
      const paths=XLSX.CFB.read(bytes,{type:'buffer'}).FullPaths || [];
      if(paths.some(p=>/\/(?:Workbook|Book)$/.test(p)))return 'xls';
      if(paths.some(p=>/\/WordDocument$/.test(p)))return 'doc';
      return null;
    }catch{return null;}
  }
  return null;
}

const clean = (s) => String(s || '').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '').replace(/\s+/g, ' ').trim();
// PDF text often arrives as "26 - 02 - 2024" or "0001 / NIT - N"; close those gaps first.
const tighten = (s) => clean(s).replace(/(\d)\s*([-/.])\s*(?=\d)/g, '$1$2').replace(/([A-Za-z0-9])\s*\/\s*(?=[A-Za-z0-9])/g, '$1/');
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MON = MONTHS.map((m) => m[0].toUpperCase() + m.slice(1));

function portalDateText(day, month, year, hour = 23, minute = 59) {
  if (+month < 1 || +month > 12 || +day < 1 || +day > new Date(Date.UTC(+year, +month, 0)).getUTCDate() || +hour > 23 || +minute > 59) return null;
  return `${String(day).padStart(2, '0')}-${MON[+month - 1]}-${year} ${String(+hour % 12 || 12).padStart(2, '0')}:${String(minute).padStart(2, '0')} ${+hour >= 12 ? 'PM' : 'AM'}`;
}

const D2 = String.raw`\d\s?\d?`;
const DATE = String.raw`(?<d>${D2})[-/.](?<m>${D2})[-/.](?<y>\d\s?\d\s?\d\s?\d)|(?<d2>\d{1,2})(?:st|nd|rd|th)?\s+(?<mon>[A-Za-z]{3,9})[,.]?\s+(?<y2>\d{4})|(?<mon3>[A-Za-z]{3,9})\s+(?<d3>\d{1,2})(?:st|nd|rd|th)?,?\s+(?<y3>\d{4})`;
const PART = String.raw`hrs\.?|hours|a\.?\s?m\.?|p\.?\s?m\.?`;
// "up to 2-30 p.m. on 29.01.2026": a time written before the date.
const PRE = String.raw`(?:(?<ph>\d{1,2})\s?[-:.]\s?(?<pm>\d{2})\s*(?<pp>${PART})\s*(?:on|of|,|dated)?\s*)?`;
const TIME = String.raw`(?:\s*[,(]?\s*(?:at|upto|up\s*to|till|by|before)?\s*(?<h>\d{1,2})\s?[:.]\s?(?<mi>\d\s?\d)\s*(?<pt>${PART})?)?`;

function hour24(h, part) {
  const p = String(part || '').toLowerCase().replace(/[.\s]/g, '');
  let hour = +h;
  if (p === 'pm' && hour < 12) hour += 12;
  if (p === 'am' && hour === 12) hour = 0;
  return hour;
}

/** Finds the first date after one of the given labels; returns the portal date text. */
export function dateAfter(text, labels) {
  const t = tighten(text);
  for (const label of labels) {
    const re = new RegExp(`(?:${label})[^0-9A-Za-z]{0,6}(?:[A-Za-z&/().,'\\s]{0,60}?)${PRE}(?:${DATE})${TIME}`, 'i');
    const m = re.exec(t);
    if (!m) continue;
    const g = Object.fromEntries(Object.entries(m.groups).map(([k, v]) => [k, v == null ? v : v.replace(/\s/g, '')]));
    let day, month, year;
    if (g.d) [day, month, year] = [g.d, g.m, g.y];
    else if (g.d2) [day, month, year] = [g.d2, MONTHS.indexOf(g.mon.slice(0, 3).toLowerCase()) + 1, g.y2];
    else [day, month, year] = [g.d3, MONTHS.indexOf(g.mon3.slice(0, 3).toLowerCase()) + 1, g.y3];
    if (!month || +year < 2000 || +year > 2100) continue;
    let hour = 23, minute = 59, timeStated = false;
    if (g.ph) { hour = hour24(g.ph, g.pp); minute = +g.pm; timeStated = true; }
    else if (g.h) { hour = hour24(g.h, g.pt); minute = +g.mi; timeStated = true; }
    const value = portalDateText(day, month, year, hour, minute);
    if (value) return { value, timeStated, evidence: m[0].slice(0, 200) };
  }
  return null;
}

const CLOSING = [
  String.raw`(?:tenders?|bids?|quotations?|offers?)\s+(?:will|shall)\s+be\s+(?:received|accepted|submitted)\s+(?:up\s*to|upto|till|before|on\s+or\s+before|by)`,
  String.raw`last\s+date\s+(?:of|for)\s+(?:the\s+)?(?:online\s+)?(?:bid\s+)?(?:submission|receipt)(?:\s+of\s+(?:bids?|tenders?))?(?:\s*(?:&|and)\s*time)?`,
  String.raw`last\s+date\s*(?:&|and)?\s*(?:time)?\s*(?:of|for)\s+(?:the\s+)?(?:online\s+)?(?:bid\s+)?(?:submission|receipt|uploading)`,
  String.raw`bid\s+submission\s+(?:end|closing)\s+date`,
  String.raw`(?:due|closing)\s+date\s*(?:&|and)?\s*(?:time)?\s*(?:of|for)\s+(?:the\s+)?(?:submission|receipt)`,
  String.raw`submission\s+(?:end|closing|last)\s+date`,
  String.raw`last\s+date\s+(?:and\s+time\s+)?(?:for|of)\s+(?:submitting|submission)`,
  String.raw`(?:bids?|tenders?|quotations?)\s+(?:shall|should|must)\s+be\s+submitted\s+(?:on\s+or\s+)?before`,
  String.raw`closing\s+date`,
];
const OPENING = [String.raw`(?:technical\s+)?bid\s+opening\s+date`, String.raw`date\s*(?:&|and)?\s*time\s+of\s+(?:technical\s+)?(?:bid\s+)?opening`, String.raw`opening\s+date`];
const PUBLISHED = [String.raw`(?:tender\s+)?(?:document\s+)?issue\s+date`, String.raw`published?\s+date`, String.raw`dated`];

function amountAfter(t, label) {
  const m = new RegExp(`(?:${label})[^0-9₹]{0,40}(?:Rs\\.?|INR|₹)?\\s*([0-9][0-9,]*(?:\\.[0-9]+)?)\\s*(lakhs?|lacs?|crores?|cr\\.?)?`, 'i').exec(t);
  if (!m) return null;
  let n = Number(m[1].replace(/,/g, ''));
  if (!Number.isFinite(n)) return null;
  // Clause numbers and page numbers sit near these labels; a real fee or deposit is larger.
  if (!m[2] && n < 100) return null;
  if (/^la/i.test(m[2] || '')) n *= 100000;
  if (/^cr/i.test(m[2] || '')) n *= 10000000;
  return String(Math.round(n));
}

function referenceIn(t) {
  t = tighten(t).replace(/([A-Za-z0-9])\s+-\s+(?=[A-Za-z0-9])/g, '$1-').replace(/(\d)\s(?=\d\b)/g, '$1');
  const m = /(?:NIT|NIeT|e-?NIT|Notice\s+Inviting\s+(?:e-?)?Tender|Tender|Bid|Ref(?:erence)?|Enquiry)\s*(?:Notice\s*)?(?:No|Number|ID)\.?\s*[:\-–]?\s*([A-Z0-9][A-Z0-9/_.()&-]{3,90})/i.exec(t);
  return m ? m[1].replace(/[.,;:)-]+$/, '') : null;
}

const GENERIC_TITLE = /^(?:[\w.-]+\.(?:pdf|docx?|xlsx?|zip)|tender(?:s| document| notice)?|notice|home|[\w-]+(?:\.[\w-]+)+)$/i;

function titleIn(t, fallback) {
  const text = clean(t);
  const patterns = [
    /name\s+of\s+(?:the\s+)?work\s*[:\-–]?\s*[“"]?(.{12,220}?)(?=[”"]|(?:\s+\d+)+\s*\|\s*P\s?a\s?g\s?e|\s+(?:\d+\.\s|estimated|location|period|time\s+of|earnest|emd|tender\s+(?:fee|value|cost)|completion|notice\s+inviting|nit\s+no)|$)/i,
    /(?:invited|invites)[^“"]{0,200}?(?:for|of)\s*[“"](.{12,220}?)[”"]/i,
    /(?:sub(?:ject)?|name\s+of\s+(?:the\s+)?item)\s*[:\-–]\s*(.{12,220}?)(?=\s{2}|\s+(?:ref|dear|sir|madam|\d+\.)|$)/i,
  ];
  for (const re of patterns) {
    const m = re.exec(text);
    if (m) return clean(m[1]).replace(/^[\s“”"']+|[\s.,;:“”"']+$/g, '');
  }
  const heading = text.match(/\b([A-Z][A-Z0-9 ,&/()'.-]{20,200}?)(?=\s+(?:NIT|Notice|Tender|Dated?|[a-z]))/);
  if (heading && /[A-Z]{4,}\s+[A-Z]{3,}/.test(heading[1])) return clean(heading[1]);
  return fallback || null;
}

/** Deterministic fields from the document text; the chosen result's title is only a fallback. */
export function parseDirectNotice(text, { rowTitle = '', rowDetail = '', host = '', fileName = '', expectedReference = '', expectedTenderId = '' } = {}) {
  const t = tighten(text);
  const fields = {};
  const gem = /\bGEM\/\d{4}\/[A-Z]+\/\d+\b/.test(t) && /Bid End Date\/Time/.test(t) ? parseGemNotice(t) : null;
  let closing = dateAfter(t, CLOSING);
  if (closing?.timeStated) fields['Bid Submission End Date'] = closing.value;
  const opening = dateAfter(t, OPENING);
  if (opening) fields['Bid Opening Date'] = opening.value;
  const published = dateAfter(t.slice(0, 3000), PUBLISHED);
  if (published) fields['Published Date'] = published.value;
  const reference = referenceIn(t);
  if (reference) fields['Tender Reference Number'] = reference;
  const fallbackTitle = clean(rowTitle) && !GENERIC_TITLE.test(clean(rowTitle)) ? clean(rowTitle) : '';
  // A descriptive file name ("Corrigendum 3, D-P Bridge") is the last resort.
  const fileTitle = clean(String(fileName).replace(EXT, '').replace(/[_+]+/g, ' ').replace(/%20/g, ' '));
  const namedFile = /[a-z]{3,}.*\s+.*[a-z]{3,}/i.test(fileTitle) && !/^[0-9a-f]{16,}$/i.test(fileTitle) ? fileTitle : '';
  fields.Title = titleIn(t, '');
  // The document format, not its hosting domain, selects the parser. Official
  // institutions often mirror the original bilingual GeM notice PDF.
  if (gem) {
    Object.assign(fields, gem.fields);
    const deadline = t.match(/Bid End Date\/Time\s+\d{2}-\d{2}-\d{4}\s+\d{2}:\d{2}(?::\d{2})?/);
    closing = fields['Bid Submission End Date'] ? { value: fields['Bid Submission End Date'], timeStated: true, evidence: deadline?.[0] || null } : null;
  }
  const compact=value=>String(value||'').toLowerCase().replace(/[^a-z0-9]/g,'');
  const corroboration=[];
  for(const [label,value] of [['search reference',expectedReference],['search tender ID',expectedTenderId]])if(value&&!compact(t).includes(compact(value)))corroboration.push(`document match for ${label}`);
  const titleWords=[...WORDS(rowTitle)].filter(word=>!STOP.has(word)&&!['supply','works','construction','government'].includes(word));
  const documentWords=WORDS(t);
  if(titleWords.length&&titleWords.filter(word=>documentWords.has(word)).length<Math.min(2,titleWords.length))corroboration.push('document match for search title');
  if (fields.Title?.length > 300) fields.Title = `${fields.Title.slice(0, 297)}…`;
  const emd = amountAfter(t, String.raw`(?:EMD|earnest\s+money(?:\s+deposit)?)(?:\s+amount)?`);
  if (emd && !gem) fields['EMD Amount in ₹'] = emd;
  const fee = amountAfter(t, String.raw`(?:tender|bid)\s+(?:document\s+)?(?:fee|cost)`);
  if (fee && !gem) fields['Tender Fee in ₹'] = fee;
  const value = amountAfter(t, String.raw`estimated\s+(?:cost|value)(?:\s+of\s+(?:the\s+)?(?:work|tender))?|(?:tender|contract)\s+value`);
  if (value && !gem) fields['Tender Value in ₹'] = value;
  fields['Organisation Chain'] ||= host;
  fields['Work Description'] = clean(text).slice(0, 20000);
  fields['Tender Category'] ||= 'Official website notice';
  const counts = NE.map((s) => [s, (t.match(new RegExp(`\\b${s}\\b`, 'gi')) || []).length]).filter(([, n]) => n);
  counts.sort((a, b) => b[1] - a[1]);
  return {
    fields,
    state: gem ? gem.state : counts[0]?.[0] || null,
    closing,
    suggestedTitle: fallbackTitle || namedFile || null,
    missing: [!fields.Title && 'document-stated title', !fields['Bid Submission End Date'] && 'document-stated closing date and time',...corroboration].filter(Boolean),
  };
}

async function pdfText(bytes) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), verbosity: 0, isEvalSupported: false }).promise;
  try {
    const parts = [], links = new Set(), unsupportedLinks = new Set();
    // The notice facts sit on the first pages; the full text is extracted again on save.
    for (let n = 1; n <= Math.min(doc.numPages, 12); n++) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      parts.push(content.items.map((x) => x.str + (x.hasEOL ? '\n' : ' ')).join(''));
      for (const annotation of await page.getAnnotations()) {
        const url = annotation.url || annotation.unsafeUrl;
        if (typeof url !== 'string' || !url.trim()) continue;
        if (allowedPublicDocument(url, 'gem')) links.add(url);
        else unsupportedLinks.add(url.slice(0, 2000));
      }
      page.cleanup();
    }
    return { text: parts.join('\n'), pages: doc.numPages, links: [...links], unsupportedLinks: [...unsupportedLinks] };
  } finally { await doc.destroy(); }
}

const WORDS = (s) => new Set(String(s || '').toLowerCase().match(/[a-z0-9]{4,}/g) || []);
const STOP = new Set(['tender', 'tenders', 'notice', 'document', 'documents', 'download', 'click', 'here', 'view', 'details', 'invitation', 'inviting', 'https', 'http', 'www']);

/**
 * Lists official documents linked from an official page, best match first.
 * Used when a search result is a tender listing page instead of the file itself.
 */
export async function documentsOnPage(pageUrl, { title = '', detail = '', fetchImpl, lookupImpl, deadlineAt } = {}) {
  const page = await officialFetch(pageUrl, { accept: 'text/html', cap: 3 * 1024 * 1024, fetchImpl, lookupImpl, deadlineAt, timeoutMs: 20000 });
  if (!/html/i.test(page.mime) && sniffDocument(page.bytes, page.url)) return [];
  const $ = load(page.bytes.toString());
  $('script,style').remove();
  const want = [...WORDS(`${title} ${detail}`)].filter((w) => !STOP.has(w));
  const found = new Map();
  $('a[href]').each((_, a) => {
    let href;
    try { href = new URL($(a).attr('href'), page.url).href; } catch { return; }
    const identity = directDocumentIdentity(href);
    if (!identity || found.has(identity.link)) return;
    const row = $(a).closest('tr,li,p,div');
    const label = clean(`${$(a).text()} ${row.length ? row.first().text().slice(0, 600) : ''}`);
    const have = WORDS(`${label} ${decodeURIComponent(new URL(identity.link).pathname)}`);
    const score = want.filter((w) => have.has(w)).length;
    found.set(identity.link, { link: identity.link, label: label.slice(0, 240) || identity.link.split('/').pop(), score });
  });
  return [...found.values()].sort((a, b) => b.score - a.score).slice(0, 40);
}

/** Download one official file and build a packet in the same shape as portal retrieval. */
export async function retrieveDirectDocument(identity, { row = {}, onEvent = () => {}, fetchImpl, lookupImpl, deadlineAt, deferValidation = false } = {}) {
  const canonical = directDocumentIdentity(identity?.link);
  if (!canonical) throw new PublicNoticeError('Only official government or institution files can be downloaded directly.', 'UNSUPPORTED_URL');
  onEvent({ message: `Downloading the official file from ${canonical.host}…` });
  const started = Date.now();
  const file = await officialFetch(canonical.link, { accept: 'application/pdf,application/octet-stream,*/*', cap: MAX_BYTES, fetchImpl, lookupImpl, deadlineAt });
  const finalUrl=new URL(file.url);
  const queryName=[...finalUrl.searchParams].find(([key,value])=>/^(?:filename|file|document|attachment|download)$/i.test(key)&&EXT.test(value))?.[1];
  const rawName = queryName || decodeURIComponent(finalUrl.pathname.split('/').pop() || 'official-document');
  const kind = sniffDocument(file.bytes, rawName);
  if (!kind) throw new PublicNoticeError('The official website returned a web page instead of the tender file. Open the notice and upload the file.', 'INVALID_DOCUMENT');
  const base = rawName.replace(EXT, '').replace(/[^A-Za-z0-9_.-]+/g, '_').slice(0, 90) || 'official-document';
  const name = `${base}.${kind}`;
  const sha256 = createHash('sha256').update(file.bytes).digest('hex');
  onEvent({ message: 'Reading document details…' });
  let text = '', pages = null, links = [], unsupportedLinks = [];
  if (kind === 'pdf') ({ text, pages, links, unsupportedLinks } = await pdfText(file.bytes));
  const parsed = parseDirectNotice(text, { rowTitle: row.title, rowDetail: row.detail, host: canonical.host, fileName: rawName, expectedReference:row.reference, expectedTenderId:row.portalTenderId });
  const gemAnnotations = parsed.fields['Tender Category'] === 'GeM bid';
  const attachmentCandidates = gemAnnotations ? links.filter(link => link !== file.url) : [];
  const referencedNotDownloaded = gemAnnotations ? [
    ...unsupportedLinks.map(url => ({ url, status: 'referenced-not-downloaded', reason: 'Unsupported attachment or external reference; no supported download endpoint was provided' })),
    ...attachmentCandidates.slice(7).map(url => ({ url, status: 'referenced-not-downloaded', reason: 'Eight-file packet limit reached' })),
  ] : [];
  const evidence = {
    schemaVersion: 1, sourceUrl: canonical.link, finalUrl: file.url, pages, parseResult: parsed,
    downloads: [{ url: file.url, status: 'downloaded', bytes: file.bytes.length, format: kind }, ...referencedNotDownloaded],
    completeness: referencedNotDownloaded.length ? 'partial' : 'single-official-file',
    closingDateEvidence: parsed.closing?.evidence || null,
    closingTimeStated: parsed.closing?.timeStated ?? null,
  };
  if (parsed.missing.length && !deferValidation)
    throw new PublicNoticeError(
      kind === 'pdf' && !clean(text)
        ? 'The official PDF is a scanned image with no readable text, so its closing date could not be checked. Upload it with the manual form.'
        : `The official file was downloaded, but its ${parsed.missing.join(' and ')} could not be read. Upload it with the manual form.`,
      'MANUAL_INTAKE_REQUIRED', { parseResult: parsed, evidence },
    );
  // One official URL is one tender here; the hash keeps the key stable and short.
  const tenderId = `WEB-${createHash('sha256').update(canonical.link).digest('hex').slice(0, 12).toUpperCase()}`;
  parsed.fields['Tender ID'] = tenderId;
  const documents = [{ name, type: 'NIT', bytes: file.bytes, sha256, sourceUrl: file.url }];
  return {
    captureScope: 'The official file linked from the search result; allowlisted GeM attachments in its PDF annotations are offered for bounded collection.',
    relatedDocuments: attachmentCandidates.slice(0, 7).map(link => ({ link, anchorLabel: 'GeM supporting document', label: 'GeM supporting document' })),
    portal: { ...canonical.portal, state: parsed.state },
    sourceUrl: canonical.link,
    fields: parsed.fields,
    parseResult: parsed,
    manifest: documents.map(({ bytes, ...d }) => d),
    documents,
    evidence,
    metrics: { requests: file.requests, bytes: file.bytes.length, downloadMs: Date.now() - started },
    retrievedAt: new Date().toISOString(),
  };
}
