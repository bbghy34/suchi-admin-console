import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source=(await readFile(new URL('../lib/desk/ai/gemini.js',import.meta.url),'utf8')).replace("import { GEMINI_KEY_PLACEHOLDER } from './prompts';", "const GEMINI_KEY_PLACEHOLDER='placeholder';");
const {geminiGrounded}=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

test('REST Google Search tool, original chunk indices and safe counts match documented metadata',async()=>{
 const originalFetch=globalThis.fetch, originalLog=console.info;
 const logs=[];let request;
 globalThis.fetch=async(url,options)=>{
  request={url,options,body:JSON.parse(options.body)};
  return new Response(JSON.stringify({candidates:[{content:{parts:[{text:'Verified answer'}]},groundingMetadata:{
   webSearchQueries:['sensitive search terms','sensitive search terms','second terms'],
   searchEntryPoint:{renderedContent:'<div>Search suggestions</div>'},
   groundingChunks:[{retrievedContext:{uri:'internal'}},{web:{uri:'https://assamtenders.gov.in/nicgep/app',title:'Official notice'}},{web:{uri:'ftp://invalid',title:'skip'}}],
   groundingSupports:[{groundingChunkIndices:[1],segment:{text:'Verified notice'}}],
  }}]}),{status:200});
 };
 console.info=(...args)=>logs.push(args.join(' '));
 try{
  const result=await geminiGrounded({apiKey:'test-secret-api-key',system:'private system text',user:'private user query'});
  assert.match(request.url,/:generateContent$/);assert.deepEqual(request.body.tools,[{google_search:{}}]);
  assert.equal(request.options.headers['x-goog-api-key'],'test-secret-api-key');
  assert.equal(result.chunks.length,1);assert.equal(result.chunks[0].originalChunkIndex,1);
  assert.deepEqual(result.supports[0].groundingChunkIndices,[1]);
  assert.equal(result.metrics.searchQueryCount,2);assert.equal(result.metrics.sourceCount,1);assert.equal(result.metrics.grounded,true);
  assert.deepEqual(result.webSearchQueries,['sensitive search terms','sensitive search terms','second terms']);
  assert.ok(result.searchEntryPoint.renderedContent);
  assert.equal(logs.length,1);assert.match(logs[0],/gemini_grounding/);
  assert.doesNotMatch(logs[0],/test-secret|private|sensitive search|second terms|assamtenders/);
 }finally{globalThis.fetch=originalFetch;console.info=originalLog;}
});

test('ungrounded answer is observable rather than reported as searched sources',async()=>{
 const originalFetch=globalThis.fetch,originalLog=console.info;
 globalThis.fetch=async()=>new Response(JSON.stringify({candidates:[{content:{parts:[{text:'No grounded results'}]}}]}),{status:200});
 console.info=()=>{};
 try{
  const result=await geminiGrounded({apiKey:'test-secret-api-key',system:'test',user:'query'});
  assert.equal(result.metrics.grounded,false);assert.equal(result.metrics.searchQueryCount,0);assert.equal(result.chunks.length,0);
 }finally{globalThis.fetch=originalFetch;console.info=originalLog;}
});
