import test from 'node:test';import assert from 'node:assert/strict';import {createHash}from'node:crypto';
import {collectLinkedFiles}from'../lib/desk/portal-import/linked-packet.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
const original=Buffer.from('%PDF-original');
const make=()=>({documents:[{bytes:original,sha256:hash(original),sourceUrl:'https://works.assam.gov.in/nit.pdf'}],manifest:[],evidence:{downloads:[{url:'https://works.assam.gov.in/nit.pdf',status:'downloaded'}]},metrics:{requests:1}});
const lookupImpl=async()=>[{address:'93.184.216.34',family:4}];const pause=async()=>{};
test('supporting files retain hashes and reject HTML; partial result preserves originals',async()=>{
 const p=make();let n=0;await collectLinkedFiles(p,[{link:'https://works.assam.gov.in/a.pdf'},{link:'https://works.assam.gov.in/b.pdf'}],{lookupImpl,pause,fetchImpl:async()=>new Response(++n===1?'%PDF-attachment':'<html>login</html>')});
 assert.equal(p.documents.length,2);assert.equal(p.documents[1].sha256,hash(Buffer.from('%PDF-attachment')));assert.equal(p.evidence.completeness,'partial');assert.match(p.evidence.downloads[2].reason,/HTML/);
});
test('cooldown stops remaining requests and records omissions',async()=>{
 const p=make();let calls=0;await collectLinkedFiles(p,['a','b','c'].map(x=>({link:`https://works.assam.gov.in/${x}.pdf`})),{lookupImpl,pause,fetchImpl:async()=>{calls++;return new Response('busy',{status:429});}});
 assert.equal(calls,1);assert.equal(p.evidence.downloads.length,4);assert.equal(p.evidence.completeness,'partial');
});
test('duplicate bytes are not stored twice and expired budget makes no requests',async()=>{
 const p=make();await collectLinkedFiles(p,[{link:'https://works.assam.gov.in/copy.pdf'}],{lookupImpl,pause,fetchImpl:async()=>new Response(original)});assert.equal(p.documents.length,1);assert.equal(p.evidence.downloads[1].duplicateOf,hash(original));
 await collectLinkedFiles(p,[{link:'https://works.assam.gov.in/later.pdf'}],{deadlineAt:Date.now(),fetchImpl:async()=>{throw Error('Must not request');}});assert.match(p.evidence.downloads.at(-1).reason,/limit/);
});
test('cover memo uses verified same-notice full PDF facts and never discovery fallback',async()=>{
 const {validateLinkedPacket}=await import('../lib/desk/portal-import/linked-packet.mjs');
 const p=make();p.evidence.parseResult={missing:['closing time']};p.fields={'Tender ID':'WEB-SAMPLE'};p.portal={label:'works.assam.gov.in'};p.documents.push({name:'full.pdf',bytes:Buffer.from('fixture'),sourceUrl:'https://works.assam.gov.in/full.pdf'});
 const text='Name of work: Gormara bridge construction Estimated cost: Rs. 250000 Tender No: ABC/2026/123 Closing date: 05/10/2026 at 10:30 AM';
 await validateLinkedPacket(p,{title:'Gormara bridge construction'},{extract:async()=>({text})});
 assert.equal(p.fields['Tender ID'],'WEB-SAMPLE');assert.equal(p.fields['Bid Submission End Date'],'05-Oct-2026 10:30 AM');assert.equal(p.evidence.validatedFrom,p.documents[1].sourceUrl);
 p.evidence.parseResult.missing=['closing time'];await assert.rejects(validateLinkedPacket(p,{title:'Gormara bridge construction',detail:'Closing date: 05/10/2026 at 10:30 AM'},{extract:async()=>({text:'Annual accounts'})}),e=>e.code==='MANUAL_INTAKE_REQUIRED');
});
test('GeM dynamic GTC endpoint is retained and unsupported references are visible',async()=>{
 const p=make();await collectLinkedFiles(p,[{link:'https://admin.gem.gov.in/apis/v1/gtc/pdfByDate/?date=20260910'},{link:'https://bidplus.gem.gov.in/bidding/downloadOmppdfile/'}],{lookupImpl,pause,fetchImpl:async()=>new Response('%PDF-gtc')});
 assert.equal(p.documents.length,2);assert.match(p.documents[1].sourceUrl,/pdfByDate/);assert.equal(p.evidence.completeness,'partial');assert.match(p.evidence.downloads.at(-1).reason,/Unsupported/);
});
