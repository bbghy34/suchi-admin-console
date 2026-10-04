import test from 'node:test';
import assert from 'node:assert/strict';
import {importJobBody,importJobResult,readJobResponse,ACTIVE_IMPORT_JOB_STATUSES,importJobRetryTime,statusPollError,importJobsCompletedSince} from '../lib/desk/portal-import/jobs-client.mjs';
test('job submission preserves existing discovery payload and excludes unrelated client fields',()=>{
 const body=JSON.parse(importJobBody({query:'road',secret:'never sent',row:{title:'Road',link:'https://example.gov.in/notice',detail:'a'.repeat(13000),portalTenderId:'id',reference:'ref',documents:[{name:'notice.pdf'}],other:'unused'}}));
 assert.equal(body.row.detail.length,12000);assert.equal(body.row.portalTenderId,'id');assert.deepEqual(body.row.documents,[{name:'notice.pdf'}]);assert.equal(body.secret,undefined);assert.equal(body.row.other,undefined);
});
test('explicit match choice uses original import contract without losing identifiers',()=>{
 assert.deepEqual(JSON.parse(importJobBody({link:'https://example.gov.in/n',tenderId:'2026_ID',reference:'ref',query:'road'})),{query:'road',link:'https://example.gov.in/n',tenderId:'2026_ID',reference:'ref'});
 assert.throws(()=>importJobBody({row:{documents:['a'.repeat(20000)]}}),/too much detail/);
 assert.throws(()=>importJobBody({}),/Choose/);
});
test('transport errors remain failures; object/string results accepted',async()=>{
 assert.deepEqual(await readJobResponse(Response.json({ok:true,job:{id:'one'}})),{ok:true,job:{id:'one'}});
 await assert.rejects(readJobResponse(Response.json({ok:false,error:'Busy'},{status:429})),/Busy/);
 await assert.rejects(readJobResponse(new Response('<html>Error</html>',{status:500})),/Could not check/);
 assert.deepEqual(importJobResult({resultJSON:'{"tenderId":"abc"}'}),{tenderId:'abc'});assert.equal(importJobResult({resultJSON:'broken'}),null);
 assert.equal(ACTIVE_IMPORT_JOB_STATUSES.has('NEEDS_INPUT'),false);assert.equal(ACTIVE_IMPORT_JOB_STATUSES.has('RUNNING'),true);
});

test('queue accepts nullable optional match fields and rejects UTF8 overflow',()=>{
 assert.deepEqual(JSON.parse(importJobBody({link:'https://example.gov.in/n',reference:null,query:null})),{link:'https://example.gov.in/n'});
 assert.throws(()=>importJobBody({row:{title:'道路'.repeat(4000)}}),/too much detail/);
});
test('cooldown parses timestamps; timeout surfaced while hidden-tab cancellation stays quiet',()=>{
 assert.equal(importJobRetryTime({retryAt:2000},1000),2000);assert.equal(importJobRetryTime({retryAt:500},1000),null);
 assert.equal(importJobRetryTime({retryAt:'invalid'},1000),null);
 assert.match(statusPollError(new Error('aborted'),{aborted:true,reason:{name:'TimeoutError'}}),/took too long/);
 assert.equal(statusPollError(new Error('aborted'),{aborted:true,reason:{name:'AbortError'}}),'');
});

test('completion tracking catches jobs finished between polls without initial refresh loops',()=>{
 const finished=[{id:'fast',status:'SUCCEEDED'}];
 assert.equal(importJobsCompletedSince(null,finished),false);
 assert.equal(importJobsCompletedSince(new Map(),finished),true);
 assert.equal(importJobsCompletedSince(new Map([['fast','SUCCEEDED']]),finished),false);
 assert.equal(importJobsCompletedSince(new Map([['fast','RUNNING']]),finished),true);
 assert.equal(importJobsCompletedSince(new Map(),[{id:'queued',status:'QUEUED'}]),false);
 for(const status of ['FAILED','NEEDS_INPUT','INTERRUPTED'])assert.equal(importJobsCompletedSince(new Map(),[{id:'job',status}]),true);
});
