import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import babel from 'next/dist/compiled/babel/core.js';
import * as transport from '../lib/desk/portal-import/jobs-client.mjs';
import * as stages from '../lib/desk/portal-import/stages.mjs';
import * as searchCache from '../components/desk/search-cache.js';
const require=createRequire(import.meta.url);
// Compile the real JSX dependencies; the stage tracker is part of this UI contract.
function loadComponent(name, dependencies={}) {
 const source=fs.readFileSync(new URL(`../components/desk/${name}.jsx`,import.meta.url),'utf8');
 const {code}=babel.transformSync(source,{filename:`${name}.jsx`,presets:[['next/babel',{'preset-env':{modules:'commonjs'}}]]});
 const module={exports:{}};
 Function('require','module','exports',code)(name=>dependencies[name] ?? require(name),module,module.exports);
 return module.exports;
}
const stageTrack=loadComponent('ImportStageTrack',{'@/lib/desk/portal-import/stages.mjs':stages});
const module={exports:loadComponent('OfficialImportJobs',{
 '@/lib/desk/portal-import/jobs-client.mjs':transport,
 './ImportStageTrack':stageTrack,
 './search-cache':searchCache,
})};
const render=job=>renderToStaticMarkup(React.createElement(module.exports.OfficialImportJobStatus,{job,onRetry:()=>{},onChoose:()=>{}}));
test('completion exposes saved tender and incomplete attachment warnings',()=>{
 const html=render({id:'job',status:'SUCCEEDED',resultJSON:{tenderId:'tender-1',downloadWarnings:['missing'],extractionWarnings:['no text']}});
 assert.match(html,/Tender saved/);assert.match(html,/\/tenders\/desk\/tenders\/tender-1/);assert.match(html,/attachments could not be retrieved/);assert.match(html,/manual text review/);assert.doesNotMatch(html,/Try download again/);
});
test('failed cooldown is visible and disables retry',()=>{
 const html=render({id:'job',status:'FAILED',error:'Portal busy',retryAt:Date.now()+60000,canRetry:true});
 assert.match(html,/role="alert"/);assert.match(html,/Portal busy/);assert.match(html,/Retry after/);assert.match(html,/disabled=""/);assert.match(html,/Try download again/);
});
test('running and ambiguity states expose distinct next actions',()=>{
 assert.match(render({id:'job',status:'RUNNING'}),/You can leave this page/);
 const html=render({id:'job',status:'NEEDS_INPUT',resultJSON:{needsChoice:true,matches:[{title:'Official road work',portal:'Assam',tenderId:'2026_1',officialLink:'https://assamtenders.gov.in/'}]}});
 assert.match(html,/Choose the official notice/);assert.match(html,/Official road work/);assert.doesNotMatch(html,/Tender saved/);
});

test('one get-files action automatically uses jobs without a foreground/background choice',()=>{
 const html=renderToStaticMarkup(React.createElement(module.exports.OfficialImportJobs,{payload:{row:{title:'Road work',link:'https://assamtenders.gov.in/'}}}));
 assert.equal((html.match(/<button/g)||[]).length,1);
 assert.match(html,/Save tender &amp; files/);assert.match(html,/You can leave this page/);
 assert.doesNotMatch(html,/Run in background|Get official files/);
});
test('a failed job renders its repeated progress/error message only once',()=>{
 const error='The official notice has no document download links.';
 const html=render({id:'job',status:'FAILED',message:error,error});
 assert.equal(html.split(error).length-1,1);
});
test('review outcome keeps original artifact links but rejects external download URLs',()=>{
 const html=render({id:'job',status:'NEEDS_REVIEW',resultJSON:{artifacts:[
  {id:'original',name:'Tender.pdf',downloadUrl:'/api/desk/portal-import/artifacts/original'},
  {id:'external',name:'Unsafe.pdf',downloadUrl:'https://other.example/file.pdf'},
 ]}});
 assert.match(html,/Tender.pdf/);assert.match(html,/Complete tender details/);
 assert.doesNotMatch(html,/Unsafe.pdf|Try download again/);
});

test('choosing a corrected notice retains package evidence without reusing the wrong tender ID',()=>{
 const payload=module.exports.selectedNoticePayload({title:'Official road work',officialLink:'https://pmgsytenders.gov.in/correct',evidence:'Package AS082133 official notice'}, {
  row:{title:'Construction of road AS082133',detail:'Wrong old notice 2020_WRONG_1',portalTenderId:'2020_WRONG_1',documents:[{url:'https://wrong.example/file.pdf'}]},query:'Assam road',
 });
 const submitted=JSON.parse(transport.importJobBody(payload));
 assert.equal(submitted.row.title,'Construction of road AS082133');
 assert.equal(submitted.row.detail,'Package AS082133 official notice');
 assert.equal(submitted.row.link,'https://pmgsytenders.gov.in/correct');
 assert.equal(submitted.row.portalTenderId,undefined);assert.deepEqual(submitted.row.documents,[]);
 assert.equal(submitted.query,'Assam road');assert.doesNotMatch(JSON.stringify(submitted),/WRONG/);
});
test('notice choice preserves explicit IDs, caps evidence and uses match title when no original row exists',()=>{
 const payload=module.exports.selectedNoticePayload({title:'Official title',officialLink:'https://assamtenders.gov.in/correct',tenderId:'2026_VALID_1',reference:'NIT-1',evidence:'x'.repeat(13000)});
 assert.equal(payload.row.title,'Official title');assert.equal(payload.row.detail.length,12000);
 assert.equal(payload.row.portalTenderId,'2026_VALID_1');assert.equal(payload.row.reference,'NIT-1');
});
