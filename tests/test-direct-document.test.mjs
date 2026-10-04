import test from 'node:test';
import assert from 'node:assert/strict';
import {zipSync,strToU8} from 'fflate';
import {officialFetch,directDocumentIdentity,privateAddress,sniffDocument,parseDirectNotice,retrieveDirectDocument,documentsOnPage} from '../lib/desk/portal-import/direct-document.mjs';
const lookupImpl=async()=>[{address:'8.8.8.8',family:4}];
test('official download endpoints and filename queries supported; malformed encodings rejected',()=>{
 for(const path of ['/download?id=123','/viewfile.php?fileid=abc','/files?filename=notice.pdf','/notice?format=pdf','/download/123'])assert.ok(directDocumentIdentity('https://example.gov.in'+path),path);
 for(const path of ['/bad%zz.pdf','/bad%00.pdf','/download','/notice'])assert.equal(directDocumentIdentity('https://example.gov.in'+path),null);
 assert.equal(directDocumentIdentity('https://example.gov.in.evil.test/a.pdf'),null);
});
test('private IPv6 mapped hex and expanded addresses blocked',()=>{
 for(const ip of ['::ffff:7f00:1','0:0:0:0:0:ffff:c0a8:101','::ffff:10.0.0.1','::1','::','fd00::1','fe80::1','ff02::1','10.0.0.1'])assert.equal(privateAddress(ip),true,ip);
 for(const ip of ['8.8.8.8','::ffff:808:808','2606:4700:4700::1111'])assert.equal(privateAddress(ip),false,ip);
});
test('short or corrupt signatures rejected and real ZIP content beats misleading extension',()=>{
 for(const b of [Buffer.alloc(0),Buffer.from('a'),Buffer.from('PK'),Buffer.from([0xd0,0xcf,0x11,0xe0])])assert.equal(sniffDocument(b,'a.doc'),null);
 const plain=Buffer.from(zipSync({'note.txt':strToU8('text')}));assert.equal(sniffDocument(plain,'fake.docx'),'zip');
 const word=Buffer.from(zipSync({'[Content_Types].xml':strToU8('x'),'word/document.xml':strToU8('x')}));assert.equal(sniffDocument(word,'wrong.pdf'),'docx');
 assert.equal(sniffDocument(Buffer.from('%PDF-1.7'),'wrong.xls'),'pdf');
});
test('redirect validates DNS each hop and spaces requests',async()=>{
 let lookups=0,requests=0;const spaces=[];
 const r=await officialFetch('https://example.gov.in/download?id=1',{lookupImpl:async()=>{lookups++;return lookupImpl();},sleepImpl:async ms=>spaces.push(ms),fetchImpl:async()=>++requests===1?new Response(null,{status:302,headers:{location:'/file.pdf'}}):new Response('%PDF-1.7')});
 assert.equal(r.bytes.toString(),'%PDF-1.7');assert.equal(lookups,2);assert.equal(r.requests,2);assert.deepEqual(spaces,[2000]);
 await assert.rejects(officialFetch('https://example.gov.in/file.pdf',{lookupImpl:async()=>[{address:'::ffff:7f00:1'}],fetchImpl:async()=>{throw Error('Must not fetch');}}),e=>e.code==='UNSAFE_REDIRECT');
});
test('shared deadline covers hanging body even when fetch ignores abort',async()=>{
 const body=new ReadableStream({start(c){c.enqueue(new Uint8Array([1]));}});
 await assert.rejects(officialFetch('https://example.gov.in/file.pdf',{lookupImpl,deadlineAt:Date.now()+20,fetchImpl:async()=>new Response(body)}),e=>e.code==='TIMEOUT');
});
test('shared deadline bounds DNS and redirects rather than restarting per hop',async()=>{
 await assert.rejects(officialFetch('https://example.gov.in/file.pdf',{lookupImpl:()=>new Promise(()=>{}),timeoutMs:15}),e=>e.code==='TIMEOUT');
 await assert.rejects(officialFetch('https://example.gov.in/file.pdf',{lookupImpl,deadlineAt:Date.now()+20,fetchImpl:async()=>new Response(null,{status:302,headers:{location:'/next.pdf'}})}),e=>e.code==='TIMEOUT');
});
test('response length capped and external redirects rejected',async()=>{
 await assert.rejects(officialFetch('https://example.gov.in/file.pdf',{lookupImpl,cap:2,fetchImpl:async()=>new Response('large')}),e=>e.code==='LIMIT');
 await assert.rejects(officialFetch('https://example.gov.in/file.pdf',{lookupImpl,fetchImpl:async()=>new Response(null,{status:302,headers:{location:'http://localhost/secret'}})}),e=>e.code==='UNSAFE_REDIRECT');
});
test('discovery text cannot establish closing date or reference of unrelated document',()=>{
 const p=parseDirectNotice('Unrelated document',{rowTitle:'Road construction work',rowDetail:'Tender No ABC/123 Last date of submission 05.10.2026 at 10:30'});
 assert.equal(p.fields['Bid Submission End Date'],undefined);assert.equal(p.fields['Tender Reference Number'],undefined);assert.ok(p.missing.includes('document-stated closing date and time'));
 const withoutTime=parseDirectNotice('Name of work: Road construction Estimated cost 100000 Last date of submission 05.10.2026');assert.equal(withoutTime.fields['Bid Submission End Date'],undefined);
 const actual=parseDirectNotice('Name of work: Road construction Estimated cost 100000 Last date of submission 05.10.2026 at 10:30');assert.equal(actual.fields['Bid Submission End Date'],'05-Oct-2026 10:30 AM');
});
test('document matching rejects conflicting discovery title and reference',()=>{
 const text='Name of work: Road repair in Guwahati Estimated cost 100000 Tender No ABC/123 Last date of submission 05.10.2026 at 10:30';
 const mismatch=parseDirectNotice(text,{rowTitle:'Medical equipment hospital',expectedReference:'OTHER/999',expectedTenderId:'2026_OTHER'});
 assert.ok(mismatch.missing.includes('document match for search reference'));assert.ok(mismatch.missing.includes('document match for search tender ID'));assert.ok(mismatch.missing.includes('document match for search title'));
 const matched=parseDirectNotice(text,{rowTitle:'Road repair Guwahati',expectedReference:'ABC/123'});assert.deepEqual(matched.missing,[]);
 const generic=parseDirectNotice('Last date of submission 05.10.2026 at 10:30',{rowTitle:'Road repair Guwahati'});assert.equal(generic.fields.Title,null);assert.ok(generic.missing.includes('document-stated title'));
});
test('default native transport pins validated DNS answer without resolving again',async t=>{
 const https=(await import('node:https')).default;
 const {syncBuiltinESMExports}=await import('node:module');
 const {EventEmitter}=await import('node:events');
 const {Readable}=await import('node:stream');
 let lookups=0,pinned;
 t.mock.method(https,'request',(url,options,callback)=>{
   options.lookup(url.hostname,{all:true},(err,addresses)=>{assert.equal(err,null);pinned=addresses;});
   const request=new EventEmitter();request.end=()=>{const response=Readable.from([Buffer.from('%PDF-1.7')]);response.statusCode=200;response.headers={'content-type':'application/pdf'};callback(response);};return request;
 });
 syncBuiltinESMExports();
 try{const result=await officialFetch('https://example.gov.in/n.pdf',{lookupImpl:async()=>{lookups++;return [{address:'8.8.8.8',family:4}];}});assert.equal(result.bytes.toString(),'%PDF-1.7');assert.equal(lookups,1);assert.deepEqual(pinned,[{address:'8.8.8.8',family:4}]);}
 finally{t.mock.restoreAll();syncBuiltinESMExports();}
});

test('public wrappers propagate shared deadline without starting a fetch',async()=>{
 const options={deadlineAt:Date.now()-1,lookupImpl:async()=>{throw Error('Unexpected DNS');},fetchImpl:async()=>{throw Error('Unexpected fetch');}};
 await assert.rejects(retrieveDirectDocument(directDocumentIdentity('https://example.gov.in/n.pdf'),options),e=>e.code==='TIMEOUT');
 await assert.rejects(documentsOnPage('https://example.gov.in/notice',options),e=>e.code==='TIMEOUT');
});

function noticePdf(lines, links = []) {
  const content='BT /F1 12 Tf 40 750 Td '+lines.map((line,i)=>`${i?'0 -20 Td ':''}(${line.replace(/[\\()]/g,'\\$&')}) Tj`).join('\n')+' ET';
  const objects=[
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R /Annots ['+links.map((_,i)=>`${i+6} 0 R`).join(' ')+'] >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
  ];
  objects.push(...links.map(link=>`<< /Type /Annot /Subtype /Link /Rect [40 40 200 60] /A << /S /URI /URI (${link}) >> >>`));
  let pdf='%PDF-1.4\n',offsets=[0];
  objects.forEach((object,i)=>{offsets.push(Buffer.byteLength(pdf));pdf+=`${i+1} 0 obj\n${object}\nendobj\n`;});
  const xref=Buffer.byteLength(pdf);
  pdf+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`+offsets.slice(1).map(n=>`${String(n).padStart(10,'0')} 00000 n \n`).join('')+`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf);
}
test('deterministic PDF download pipeline corroborates official fields and original bytes',async()=>{
  const {createHash}=await import('node:crypto');
  const bytes=noticePdf(['Name of work: Repair of Guwahati bridge lighting','Estimated cost: Rs 250000','Tender No: ABC/123','Last date of submission: 05.10.2026 at 10:30']);
  const identity=directDocumentIdentity('https://example.gov.in/notice.pdf');
  const options={row:{title:'Guwahati bridge lighting',reference:'ABC/123',detail:'Last date of submission 01.01.2099 at 12:00'},lookupImpl,deadlineAt:Date.now()+5000,fetchImpl:async()=>new Response(bytes,{headers:{'content-type':'application/pdf'}})};
  const packet=await retrieveDirectDocument(identity,options);
  assert.equal(packet.fields.Title,'Repair of Guwahati bridge lighting');
  assert.equal(packet.fields['Tender Reference Number'],'ABC/123');
  assert.equal(packet.fields['Bid Submission End Date'],'05-Oct-2026 10:30 AM');
  assert.equal(packet.fields['Tender Value in ₹'],'250000');
  assert.deepEqual(packet.documents[0].bytes,bytes);assert.equal(packet.documents[0].sha256,createHash('sha256').update(bytes).digest('hex'));
  assert.equal(packet.evidence.closingTimeStated,true);assert.equal(packet.metrics.requests,1);
  await assert.rejects(retrieveDirectDocument(identity,{...options,row:{...options.row,reference:'OTHER/987'}}),e=>e.code==='MANUAL_INTAKE_REQUIRED'&&e.parseResult.missing.includes('document match for search reference'));
});

test('deferred validation retains cover PDF evidence while default intake still rejects it',async()=>{
 const bytes=noticePdf(['Office memorandum','Please see the enclosed tender document for full terms.']);
 const identity=directDocumentIdentity('https://example.gov.in/cover.pdf');
 const options={lookupImpl,fetchImpl:async()=>new Response(bytes,{headers:{'content-type':'application/pdf'}})};
 await assert.rejects(retrieveDirectDocument(identity,options),e=>e.code==='MANUAL_INTAKE_REQUIRED');
 const packet=await retrieveDirectDocument(identity,{...options,deferValidation:true});
 assert.deepEqual(packet.documents[0].bytes,bytes);assert.ok(packet.parseResult.missing.includes('document-stated closing date and time'));assert.equal(packet.evidence.parseResult,packet.parseResult);
 assert.equal(packet.fields['Bid Submission End Date'],undefined);
});

const gemLines = ['Bid Number GEM/2026/B/9874034','Bid End Date/Time 01-10-2026 14:00:00','Bid Opening Date/Time 01-10-2026 14:30:00','Item Category Laboratory equipment maintenance Total Quantity 1','Ministry/State Name Ministry of Chemicals','Consignees / Reporting Officer Guwahati Assam 781101'];
test('mirrored GeM format supplies real title deadline and consignee while preserving corroboration',()=>{
 const text=gemLines.join(' ');
 const result=parseDirectNotice(text,{rowTitle:'Laboratory equipment maintenance',expectedReference:'GEM/2026/B/9874034',expectedTenderId:'GEM/2026/B/9874034'});
 assert.deepEqual(result.missing,[]);assert.equal(result.fields.Title,'Laboratory equipment maintenance');assert.equal(result.fields['Bid Submission End Date'],'01-Oct-2026 02:00 PM');assert.equal(result.fields['Tender Reference Number'],'GEM/2026/B/9874034');assert.equal(result.state,'Assam');assert.equal(result.closing.timeStated,true);
 const mismatch=parseDirectNotice(text,{rowTitle:'Road bridge repairs',expectedReference:'GEM/2026/B/9999999',expectedTenderId:'2026_OTHER_1'});
 for(const label of ['search reference','search tender ID','search title'])assert(mismatch.missing.includes(`document match for ${label}`));
 const noConsignee=parseDirectNotice(text.replace('Consignees / Reporting Officer Guwahati Assam 781101','Incidental address Assam 781101'));
 assert.equal(noConsignee.state,null);
});
test('mirrored GeM PDF keeps WEB identity and offers only allowlisted annotation attachments',async()=>{
 const approved='https://assets-bg.gem.gov.in/resources/upload/shared_doc/gtc/test.pdf';
 const unsupported='https://bidplus.gem.gov.in/bidding/bid/downloadOmppdfile?fileDownloadPath=';
 const bytes=noticePdf(gemLines,[approved,approved,'https://evil.example/file.pdf','http://127.0.0.1/file.pdf',unsupported]);
 const packet=await retrieveDirectDocument(directDocumentIdentity('https://niperguwahati.ac.in/DOC/TENDER/GeM-Bidding-9874034.pdf'),{lookupImpl,fetchImpl:async()=>new Response(bytes),row:{title:'Laboratory equipment maintenance',reference:'GEM/2026/B/9874034'}});
 assert.match(packet.fields['Tender ID'],/^WEB-/);assert.equal(packet.fields['Tender Reference Number'],'GEM/2026/B/9874034');assert.equal(packet.fields['Bid Submission End Date'],'01-Oct-2026 02:00 PM');assert.equal(packet.portal.state,'Assam');assert.deepEqual(packet.relatedDocuments.map(d=>d.link),[approved]);assert.equal(packet.metrics.requests,1);
 assert.equal(packet.evidence.completeness,'partial');
 assert(packet.evidence.downloads.some(d=>d.url===unsupported && d.status==='referenced-not-downloaded'));
 assert.equal(packet.evidence.downloads.filter(d=>d.status==='referenced-not-downloaded').length,3);
});
