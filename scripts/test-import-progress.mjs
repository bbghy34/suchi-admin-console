import test from 'node:test';
import assert from 'node:assert/strict';
import { readImportResponse } from '../lib/desk/portal-import/progress-client.mjs';
function streamed(events, byteChunks = false) {
 const bytes = new TextEncoder().encode(events.map(e => JSON.stringify(e)).join('\n'));
 return new Response(new ReadableStream({start(c) {
   if (byteChunks) for (const byte of bytes) c.enqueue(Uint8Array.of(byte));
   else c.enqueue(bytes);
   c.close();
 }}), {headers:{'content-type':'application/x-ndjson'}});
}
test('streams stages across arbitrary UTF-8 boundaries and returns saved result', async () => {
 const stages=[];
 const result = await readImportResponse(streamed([
  {type:'progress',message:'Reading notice ₹…'}, {type:'heartbeat'},
  {type:'progress',message:'Solving CAPTCHA 2'},
  {type:'result',status:200,data:{ok:true,tenderId:'saved'}}
 ],true),e=>stages.push(e.message));
 assert.deepEqual(stages,['Reading notice ₹…','Solving CAPTCHA 2']);
 assert.equal(result.tenderId,'saved');
});
test('stream failure retains cooldown and status for recovery UI',async()=>{
 await assert.rejects(readImportResponse(streamed([{type:'result',status:429,data:{ok:false,error:'Portal busy',retryAt:123}}])),e=>e.status===429 && e.data.retryAt===123);
});
test('disconnect never reports success without final save acknowledgement',async()=>{
 await assert.rejects(readImportResponse(streamed([{type:'progress',message:'Saving'}])),/interrupted/);
});
test('JSON API remains compatible',async()=>{
 assert.equal((await readImportResponse(Response.json({ok:true,existing:true}))).existing,true);
 await assert.rejects(readImportResponse(Response.json({ok:false,error:'Unauthorized'},{status:401})),e=>e.status===401);
});
