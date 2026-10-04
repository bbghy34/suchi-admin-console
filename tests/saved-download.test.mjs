import test from 'node:test';
import assert from 'node:assert/strict';
import {savedDownloadKey,findSavedDownload} from '../lib/desk/portal-import/saved-download.mjs';
test('global keys ignore user/search and reject ambiguous IDs or generic portal URLs',()=>{
 const link='https://assamtenders.gov.in/nicgep/app';
 assert.deepEqual(savedDownloadKey({row:{link,portalTenderId:'2026_BoTC_54225_1'},query:'road'}),{sourceId:'assam',portalTenderId:'2026_BoTC_54225_1'});
 assert.equal(savedDownloadKey({row:{link}}),null);
 assert.equal(savedDownloadKey({row:{link,title:'2026_BoTC_54225_1 and 2026_BoTC_54226_1'}}),null);
 assert.deepEqual(savedDownloadKey({link:'https://bidplus.gem.gov.in/showbidDocument/9874034'}),{sourceId:'gem',sourceUrl:'https://bidplus.gem.gov.in/showbidDocument/9874034'});
});
test('reuse keeps warnings and saved originals, with no owner filter',async()=>{
 const where={sourceId:'gem',sourceUrl:'https://bidplus.gem.gov.in/showbidDocument/9874034'};
 const db={tender:{findFirst:async(q)=>{assert.deepEqual(q.where,where);return {id:'shared',documents:[
 {fileName:'bid.pdf',size:100,textStatus:'TEXT',file:{documentId:'1'}},
 {fileName:'spec.pdf',size:200,textStatus:'EMPTY',file:{documentId:'2'}},
 {fileName:'official-record.txt',extractedText:JSON.stringify({evidence:{completeness:'partial',downloads:[{status:'omitted',url:'https://example.test/file',reason:'Unavailable'}]}})},
 ]}}}};
 const result=await findSavedDownload(db,where);
 assert.equal(result.existing,true);assert.equal(result.documentCount,2);assert.equal(result.completeness,'partial');
 assert.equal(result.downloadWarnings.length,1);assert.deepEqual(result.extractionWarnings,['spec.pdf']);
});
test('missing originals cannot be reported as a successful cache hit',async()=>{
 for(const documents of [[],[{fileName:'bid.pdf',size:100,file:null}]]){
  await assert.rejects(findSavedDownload({tender:{findFirst:async()=>({id:'broken',documents})}},{sourceId:'gem'}),e=>e.code==='SAVED_FILES_MISSING');
 }
});
test('miss does not fabricate a record',async()=>{
 assert.equal(await findSavedDownload({tender:{findFirst:async()=>null}},{sourceId:'gem'}),null);
 assert.equal(await findSavedDownload({},null),null);
});
test('manifest detects a deleted original row and ignores unrelated manual attachments',async()=>{
 const record={fileName:'official-record.txt',extractedText:JSON.stringify({documents:[{name:'bid.pdf',size:100}]})};
 const db={tender:{findFirst:async()=>({id:'saved',documents:[record]})}};
 await assert.rejects(findSavedDownload(db,{sourceId:'gem'}),e=>e.code==='SAVED_FILES_MISSING');
 db.tender.findFirst=async()=>({id:'saved',documents:[record,{fileName:'bid.pdf',size:100,textStatus:'TEXT',file:{documentId:'1'}},{fileName:'later-note.txt',size:0,file:null}]});
 assert.equal((await findSavedDownload(db,{sourceId:'gem'})).documentCount,1);
});
test('database byte length mismatch rejects a cache hit',async()=>{
 const db={tender:{findFirst:async()=>({id:'saved',documents:[{fileName:'bid.pdf',size:100,file:{documentId:'1'}}]})},$queryRawUnsafe:async()=>[{count:1}]};
 await assert.rejects(findSavedDownload(db,{sourceId:'gem'}),e=>e.code==='SAVED_FILES_MISSING');
});
