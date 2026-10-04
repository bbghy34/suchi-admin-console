/** Bounded independent sample. Explicit portal IDs; two fresh notices each, two different hosts concurrently. */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { load } from 'cheerio';
import { PORTALS } from '../lib/desk/portal-import/identity.mjs';
import { AssamPortal } from '../lib/desk/portal-import/assam.mjs';
import { extractOfficialDocument } from '../lib/desk/portal-import/extract.mjs';
import { tenderFields } from '../lib/desk/portal-import/store.mjs';
const ids = [...new Set(process.argv.slice(2))];
if (!ids.length || ids.some(id => !PORTALS.some(p => p.id === id))) throw new Error('Supply explicit registered portal IDs');
if (!process.env.TWOCAPTCHA_API_KEY) throw new Error('TWOCAPTCHA_API_KEY is required');
const root = 'tools/assam-tenders/verification/independent-sample';
mkdirSync(root, { recursive: true });
const implementationHash = createHash('sha256').update(readFileSync(new URL('../lib/desk/portal-import/assam.mjs', import.meta.url))).digest('hex');
const normalize = value => String(value || '').replace(/\s+/g, ' ').trim();
// Deliberately independent from the production parser's flat-cell walk.
function sourceFields(html) {
 const $ = load(html); const fields = {};
 $('td.td_caption').each((_, cell) => {
  const next = $(cell).next('td.td_field');
  if (next.length) fields[normalize($(cell).text())] = normalize(next.text());
 });
 return fields;
}
function signature(name, bytes) {
 if (/\.pdf$/i.test(name)) return bytes.subarray(0, 5).toString() === '%PDF-';
 if (/\.xls$/i.test(name)) return bytes.subarray(0, 8).toString('hex') === 'd0cf11e0a1b11ae1';
 if (/\.(zip|xlsx|docx)$/i.test(name)) return bytes.subarray(0, 2).toString() === 'PK';
 return !/^\s*(?:<!doctype|<html)/i.test(bytes.subarray(0,100).toString());
}
function classify(error, phase) {
 if (/session|expired/i.test(error.message)) return 'session';
 if (/captcha|solver/i.test(error.message)) return 'captcha';
 if (/extract|parse|PDF|Excel/i.test(error.message) && phase === 'extract') return 'extraction';
 if (/download|file|ZIP|20 MB|timeout|timed out/i.test(error.message)) return 'download';
 return phase === 'fields' ? 'parsing' : 'portal';
}
async function verifyPortal(id) {
 const portal = PORTALS.find(p => p.id === id);
 const firstProbe = `tools/assam-tenders/verification/multi-portal/${id}-probe.json`;
 const excluded = existsSync(firstProbe) ? JSON.parse(readFileSync(firstProbe)).sample?.fields?.['Tender ID'] : null;
 const discovery = new AssamPortal({ portal, deadlineMs: 45000 });
 let links;
 try {
  const home = await discovery.page(portal.base); const $ = load(home);
  links = [...new Set($('a[href]').toArray().map(a => new URL($(a).attr('href'), portal.base).href).filter(url => /[?&]service=direct/.test(url) && /[?&]page=Home/.test(url) && /[?&]sp=/.test(url)))].slice(0, 5);
 } catch (error) {
  writeFileSync(`${root}/${id}-discovery.json`, JSON.stringify({ id, ok:false, error:error.message, category:classify(error,'portal') }, null,2));
  return;
 }
 const seen = new Set(excluded ? [excluded] : []); let count = 0;
 for (const link of links) {
  if (count >= 2) break;
  await new Promise(resolve => setTimeout(resolve, 2000));
  const result = { id, implementationHash, sourceUrl:link, checkedAt:new Date().toISOString(), downloadOk:false, files:[] };
  let phase = 'portal'; const started = Date.now();
  const client = new AssamPortal({ portal, apiKey:process.env.TWOCAPTCHA_API_KEY, onEvent:e => {
   if(e.event === 'phase') console.log(JSON.stringify({id,sample:count,...e}));
  }});
  let target;
  try {
   await client.page(portal.base);
   const html = await client.page(link); const fields = sourceFields(html);
   const tenderId = fields['Tender ID'];
   if (!tenderId) throw new Error('Independent source parser found no tender ID');
   if (seen.has(tenderId)) continue;
   seen.add(tenderId); count++;
   result.tenderId = tenderId; result.sourceFields = fields;
   target = `${root}/${id}-${tenderId}`;
   if (existsSync(`${target}.json`)) { console.log(JSON.stringify({id,tenderId,skipped:'existing sample report'}));continue; }
   mkdirSync(target,{recursive:true});
   writeFileSync(`${target}/source.html`, html);
   phase = 'download';
   const packet = await client.retrieve(tenderId, {detailLink:link});
   result.manifest = packet.manifest; result.files = [];
   for (const doc of packet.documents) {
    const file = {name:doc.name,size:doc.bytes.length,sha256:createHash('sha256').update(doc.bytes).digest('hex'),signatureValid:signature(doc.name,doc.bytes)};
    // Persist original before attempting extraction, including files with unsupported/scanned content.
    writeFileSync(`${target}/${doc.name}`,doc.bytes);
    file.hashMatches = file.sha256 === doc.sha256;
    phase = 'extract';
    try {
     const extracted = await extractOfficialDocument(doc.bytes,/\.pdf$/i.test(doc.name)?'application/pdf':'application/octet-stream',doc.name);
     file.extraction = extracted.status; file.pages = extracted.metadata?.pages; file.sheets = extracted.metadata?.sheets?.length;
     file.textCharacters = extracted.text?.length || 0;
     const txt = normalize(extracted.text).toLowerCase();
     file.corroboration = {
      tenderId:txt.includes(tenderId.toLowerCase()),
      reference:fields['Tender Reference Number'] ? txt.includes(normalize(fields['Tender Reference Number']).toLowerCase()) : null,
      title:fields.Title ? txt.includes(normalize(fields.Title).toLowerCase()) : null,
     };
     writeFileSync(`${target}/${doc.name}.text.txt`, extracted.text || '');
    } catch(error) { file.extraction='ERROR';file.extractionError=error.message; }
    result.files.push(file);
   }
   result.manifestComplete = packet.manifest.every(item => result.files.some(file => file.name === item.name));
   result.downloadOk = result.manifestComplete && result.files.length > 0 && result.files.every(f=>f.signatureValid && f.hashMatches);
   phase = 'fields';
   result.fieldDifferences = Object.entries(fields).filter(([key,value]) => normalize(packet.fields[key]) !== value).map(([key]) => key);
   const mapped = tenderFields(packet,'independent verification');
   result.usableFields = {title:mapped.title,portalTenderId:mapped.portalTenderId,referenceNo:mapped.referenceNo,bidSubmissionEnd:mapped.bidSubmissionEnd,estimatedValue:mapped.estimatedValue,emdAmount:mapped.emdAmount,tenderFee:mapped.tenderFee,sourceId:mapped.sourceId};
   result.identityOk = mapped.portalTenderId === tenderId;
   result.sourceFieldsOk = !result.fieldDifferences.length;
   result.unsupportedDocuments = result.files.filter(f => f.extraction === 'NO_TEXT' && !/\.(pdf|xlsx?|zip)$/i.test(f.name)).map(f=>f.name);
   result.extraction = result.files.some(f=>f.extraction==='ERROR') ? 'partial-error' : result.files.some(f=>/\.(pdf|xlsx?)$/i.test(f.name)&&f.extraction==='NO_TEXT') ? 'scanned-or-empty' : 'supported-types-extracted';
   result.pdfCorroborated = result.files.some(f=>/\.pdf$/i.test(f.name)&&Object.values(f.corroboration||{}).some(Boolean));
   result.ok = result.downloadOk && result.identityOk && result.sourceFieldsOk;
  } catch(error) {result.ok=false;result.error=error.message;result.category=classify(error,phase);if(!target){count++;target=`${root}/${id}-unresolved-${count}`;}}
  result.seconds = (Date.now()-started)/1000;result.metrics = client.metrics;
  writeFileSync(`${target}.json`,JSON.stringify(result,null,2));
  console.log(JSON.stringify({event:'sample-complete',id,tenderId:result.tenderId,ok:result.ok,downloadOk:result.downloadOk,extraction:result.extraction,seconds:result.seconds,error:result.error,category:result.category,files:result.files.length}));
 }
 console.log(JSON.stringify({event:'host-complete',id,count}));
}
const concurrency = Number(process.env.SAMPLE_CONCURRENCY || 2);
if (![1, 2].includes(concurrency)) throw new Error('SAMPLE_CONCURRENCY must be 1 or 2');
const queue = [...ids];
await Promise.all(Array.from({length:concurrency},(_,index)=>index).map(async()=>{while(queue.length) await verifyPortal(queue.shift());}));
