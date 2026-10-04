import test from 'node:test';
import assert from 'node:assert/strict';
import { publicNoticeIdentity, normalizePublicDocument, allowedPublicDocument, parseGemNotice, parseSikkimNotice, retrievePublicNotice } from '../lib/desk/portal-import/public-notice.mjs';
const link = 'https://bidplus.gem.gov.in/showbidDocument/9780729';
const text = 'Bid Number: GEM/2026/B/7939158 Bid End Date/Time 01-10-2026 10:00:00 Ministry/State Name Assam विभाग Department Name Education Organisation Name Education Directorate कार्यालय Office Name Education Item Category Desktop Computers श्रेणी';
test('only exact official notice identities accepted', () => {
 assert.equal(publicNoticeIdentity(link).sourceId, 'gem');
 assert.equal(publicNoticeIdentity('https://www.sikkim.gov.in/tender/tender-info/50529').sourceId,'sikkim');
 for(const u of [link+'?url=http://localhost',link.replace('https:','http:'),link.replace('gem.gov.in','gem.gov.in.evil.test'),'https://user:pass@bidplus.gem.gov.in/showbidDocument/123','https://bidplus.gem.gov.in:443/showbidDocument/../admin']) assert.equal(publicNoticeIdentity(u),null);
});
test('linked downloads allowlisted by host and exact path/query shape', () => {
 assert.ok(allowedPublicDocument('https://admin.gem.gov.in/apis/v1/gtc/pdfByDate/?date=20260916','gem'));
 assert.ok(allowedPublicDocument('https://fulfilment.gem.gov.in/contract/slafds?fileDownloadPath=SLA_UPLOAD_PATH/2026/test@DEE.pdf','gem'));
 for(const u of ['https://127.0.0.1/test.pdf','https://admin.gem.gov.in/other','https://fulfilment.gem.gov.in/contract/slafds?fileDownloadPath=https://evil.test/file.pdf','https://fulfilment.gem.gov.in/contract/slafds?fileDownloadPath=../test.pdf','https://admin.gem.gov.in/apis/v1/gtc/pdfByDate/?date=20260916&url=http://localhost']) assert.equal(allowedPublicDocument(u,'gem'),false);
});
test('GeM labelled fields parsed, dates validated, incidental NE references rejected', () => {
 const p = parseGemNotice(text); assert.deepEqual(p.missing,[]); assert.equal(p.fields.Title,'Desktop Computers'); assert.equal(p.fields['Bid Submission End Date'],'01-Oct-2026 10:00 AM');
 assert.equal(parseGemNotice(text.replace('Name Assam','Name Defence')+' Delivery Assam').state,null);
 assert.ok(parseGemNotice(text.replace('01-10-2026','31-02-2026')).missing.includes('closing date and time'));
});
test('Sikkim missing time requires manual review instead of invented midnight', () => {
 const p = parseSikkimNotice('Last Date/Time for receipt of bids through e-procurement 28/09/2026','Road construction','50529');
 assert.equal(p.fields['Bid Submission End Date'],undefined); assert.ok(p.closingDateText); assert.equal(p.missing.length,1);
});
test('redirects cannot escape official allowlist',async()=>{
 await assert.rejects(retrievePublicNotice(publicNoticeIdentity(link),{fetchImpl:async()=>new Response(null,{status:302,headers:{location:'http://127.0.0.1/secret'}}),sleep:async()=>{}}),e=>e.code==='UNSAFE_REDIRECT');
});
test('429 stops immediately without repeated traffic',async()=>{
 let count=0;await assert.rejects(retrievePublicNotice(publicNoticeIdentity(link),{fetchImpl:async()=>{count++;return new Response('busy',{status:429});},sleep:async()=>{}}),e=>e.code==='RATE_LIMITED');assert.equal(count,1);
});
test('HTML disguised as a download is rejected',async()=>{
 await assert.rejects(retrievePublicNotice(publicNoticeIdentity(link),{fetchImpl:async()=>new Response('<html>session expired</html>'),sleep:async()=>{}}),e=>e.code==='INVALID_DOCUMENT');
});
test('oversized announced documents rejected before parsing',async()=>{
 await assert.rejects(retrievePublicNotice(publicNoticeIdentity(link),{fetchImpl:async()=>new Response('x',{headers:{'content-length':String(21*1024*1024)}}),sleep:async()=>{}}),e=>e.code==='LIMIT');
});
test('Sikkim display query normalized but unrelated query parameters rejected',()=>{
 assert.equal(publicNoticeIdentity('https://www.sikkim.gov.in/tender/tender-info/50529?Tender=Road%20work').link,'https://www.sikkim.gov.in/tender/tender-info/50529');
 assert.equal(publicNoticeIdentity('https://www.sikkim.gov.in/tender/tender-info/50529?url=x'),null);
});
test('503 honors Retry-After as retryable cooldown',async()=>{
 const before=Date.now();await assert.rejects(retrievePublicNotice(publicNoticeIdentity(link),{fetchImpl:async()=>new Response('busy',{status:503,headers:{'retry-after':'120'}}),sleep:async()=>{}}),e=>e.code==='RATE_LIMITED'&&e.status===429&&Number.isFinite(e.retryAt)&&e.retryAt>=before+120000);
});
test('explicit EMD/value preserved without confusing turnover amounts',()=>{
 const p=parseGemNotice(text+' EMD Amount 520,000 Estimated Bid Value 1250000');assert.equal(p.fields['EMD Amount in ₹'],'520000');assert.equal(p.fields['Tender Value in ₹'],'1250000');
 assert.equal(parseGemNotice(text+' Minimum Average Annual Turnover 130 Lakh').fields['Tender Value in ₹'],undefined);
});

test('Sikkim observed double slash and bare official host normalize safely',()=>{
 const u='https://sikkim.gov.in//uploads/tenders/Test.pdf';
 assert.equal(normalizePublicDocument(u,'sikkim'),'https://www.sikkim.gov.in/uploads/tenders/Test.pdf');assert.ok(allowedPublicDocument(u,'sikkim'));assert.equal(allowedPublicDocument('https://sikkim.gov.in.evil.test//uploads/tenders/Test.pdf','sikkim'),false);
});


test('GeM marketplace buyer-document PDFs are supported only at the observed path',()=>{
 const root='https://mkp.gem.gov.in/catalog_data/catalog_support_document/buyer_documents/';
 const path='9449838/54/78/703/CatalogAttrs/SpecificationDocument/2026/9/9/gem_furniture_10-09-2026_2026-09-09-16-04-50_86afcb6d5b6ac4b24c8808c829017b7b.pdf';
 assert.equal(allowedPublicDocument(root+path,'gem'),true);
 for(const url of [root+path+'?redirect=http://localhost',root+path+'#page=1',root+path.replace('.pdf','.html'),root+'../private/file.pdf',root+'%2e%2e/file.pdf',root+'abc/..%2fprivate/file.pdf',root.replace('mkp.gem.gov.in','mkp.gem.gov.in.evil.test')+path,root.replace('https:','http:')+path,'https://mkp.gem.gov.in/other/file.pdf']) assert.equal(allowedPublicDocument(url,'gem'),false,url);
});
