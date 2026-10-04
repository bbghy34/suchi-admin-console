import test from 'node:test';
import assert from 'node:assert/strict';
import { discoverOfficialDocuments } from '../lib/desk/portal-import/page-discovery.mjs';
import { resolveDiscovery } from '../lib/desk/portal-import/resolve.mjs';
const host='https://works.assam.gov.in';
const lookupImpl=async()=>[{address:'93.184.216.34',family:4}];
function fixture(pages){const calls=[];return {calls,fetchImpl:async url=>{calls.push(url);assert.ok(url in pages,`Unexpected request ${url}`);return new Response(pages[url],{headers:{'content-type':'text/html'}});}};}
const options={title:'Gormara bridge construction',detail:'',lookupImpl,pause:async()=>{}};
test('follows one relevant child notice and discovers files without crawling grandchildren',async()=>{
 const f=fixture({[host+'/tenders']:'<a href="/notice/gormara">Gormara bridge construction tender details</a><a href="/notice/unrelated">Office furniture tender</a><footer><a href="/report.pdf">Gormara bridge construction</a></footer>',[host+'/notice/gormara']:'<a href="/files/nit.pdf">Gormara bridge construction NIT</a><iframe src="/files/boq.xlsx"></iframe><a href="/notice/deeper">Gormara bridge construction tender</a>'});
 const result=await discoverOfficialDocuments(host+'/tenders',{...options,...f});
 assert.deepEqual(f.calls,[host+'/tenders',host+'/notice/gormara']);
 assert.equal(result.documents.length,2);assert.equal(result.documents[0].depth,1);assert.equal(result.documents[0].via,host+'/notice/gormara');
 assert.equal(result.evidence.maxDepth,1);
});
test('caps child pages, deduplicates files and records unvisited references',async()=>{
 const pages={[host+'/list']:Array.from({length:6},(_,i)=>`<a href="/notice/${i}">Gormara bridge construction tender ${i}</a>`).join('')};
 for(let i=0;i<3;i++)pages[host+'/notice/'+i]='<a href="/same.pdf">Gormara bridge construction</a><a href="/bad%ZZ.pdf">Broken file</a>';
 const f=fixture(pages),result=await discoverOfficialDocuments(host+'/list',{...options,...f});
 assert.equal(f.calls.length,4);assert.equal(result.documents.length,1);assert.equal(result.evidence.skipped.filter(x=>x.reason==='Child-page limit reached').length,3);
});
test('does not follow offsite pages, navigation or irrelevant official links',async()=>{
 const f=fixture({[host+'/list']:'<nav><a href="/notice/x">Gormara bridge construction tender</a></nav><a href="https://other.gov.in/notice">Gormara bridge construction tender</a><a href="/logout">Gormara bridge construction tender</a><a href="/about">About us</a><a href="https://example.com/file.pdf">Gormara bridge construction</a>'});
 const result=await discoverOfficialDocuments(host+'/list',{...options,...f});assert.equal(f.calls.length,1);assert.equal(result.documents.length,0);
});
test('shared deadline prevents requests and portal cooldown is not swallowed',async()=>{
 let calls=0;const result=await discoverOfficialDocuments(host+'/list',{...options,deadlineAt:Date.now()-1,fetchImpl:async()=>{calls++;}});
 assert.equal(calls,0);assert.match(result.evidence.skipped[0].reason,/time limit/);
 await assert.rejects(discoverOfficialDocuments(host+'/list',{...options,fetchImpl:async()=>new Response('busy',{status:429})}),e=>e.code==='RATE_LIMITED');
});
test('resolver preserves discovery provenance and asks on ambiguous sibling files',async()=>{
 const evidence={sourceUrl:host+'/list',visited:[{url:host+'/notice',depth:1}]};
 const row={link:host+'/list',title:'Gormara bridge construction'};
 const file={link:host+'/nit.pdf',label:'Gormara bridge construction',score:3,parentScore:3,via:host+'/notice'};
 const resolved=await resolveDiscovery(row,()=>{throw Error('No AI call expected');},{discover:async()=>({documents:[file],evidence})});
 assert.equal(resolved.candidate.officialLink,file.link);assert.deepEqual(resolved.discoveryEvidence,evidence);
 const ambiguous=await resolveDiscovery(row,()=>{throw Error('No AI call expected');},{discover:async()=>({documents:[file,{...file,link:host+'/other.pdf'}],evidence})});
 assert.equal(ambiguous.matches.length,2);assert.match(ambiguous.matches[0].evidence,/Linked from/);
});
test('keeps the NIT and BOQ from a single matching tender row together',async()=>{
 const f=fixture({[host+'/list']:'<table><tr><td>Gormara bridge construction</td><td><a href="/nit.pdf">NIT</a><a href="/boq.xls">BOQ</a></td></tr><tr><td>Unrelated furniture</td><td><a href="/other.pdf">NIT</a></td></tr></table>'});
 const discovery=await discoverOfficialDocuments(host+'/list',{...options,...f});
 assert.equal(discovery.documents[0].group,discovery.documents[1].group);
 const result=await resolveDiscovery({link:host+'/list',title:options.title},()=>{throw Error('No search');},{discover:async()=>discovery});
 assert.equal(result.candidate.officialLink,host+'/nit.pdf');assert.equal(result.relatedDocuments[0].link,host+'/boq.xls');
 assert.ok(discovery.evidence.visited[0].sha256);
});
test('separate notice sections cannot inherit each other attachments through an outer article',async()=>{
 const f=fixture({[host+'/list']:'<article><section><h2>Gormara bridge construction</h2><a href="/a.pdf">NIT</a><a href="/a.xls">BOQ</a></section><section><h2>Unrelated hospital equipment</h2><a href="/b.xls">BOQ</a></section></article>'});
 const discovery=await discoverOfficialDocuments(host+'/list',{...options,...f});
 assert.notEqual(discovery.documents[0].group,discovery.documents.find(d=>d.link.endsWith('/b.xls')).group);
 const result=await resolveDiscovery({link:host+'/list',title:options.title},()=>{throw Error('No search');},{discover:async()=>discovery});
 assert.deepEqual(result.relatedDocuments.map(d=>d.link),[host+'/a.xls']);
});
