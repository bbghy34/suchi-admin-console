import test from 'node:test';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import babel from 'next/dist/compiled/babel/core.js';
import * as constants from '../lib/desk/constants.js';
import * as ist from '../lib/desk/ist.js';
function compile(path,deps,extra=''){
 const source=readFileSync(new URL(path,import.meta.url),'utf8')+extra;
 const {code}=babel.transformSync(source,{filename:path,presets:[['next/babel',{'preset-env':{modules:'commonjs'}}]]});
 const module={exports:{}};Function('require','module','exports',code)(name=>{if(!(name in deps))return require(name);return deps[name];},module,module.exports);return module.exports;
}
const interpreter=compile('../lib/desk/ai/interpreter.js',{'../constants':constants,'../ist':ist,'./model':{},'./gemini':{},'./search-work-cache.mjs':{createSearchWorkCache:()=>(_key,work)=>work()}},'\nexport {mergeInterpreted};');
test('model cannot add closed notices to an ordinary search or an exclude-closed request',()=>{
 for(const query of ['Assam government road construction','Nagaland government road construction','Assam excluding closed tenders']){
  const rules=interpreter.interpretWithRules(query,new Date('2026-10-01'));
  assert.equal(rules.include_closed,false);
  assert.equal(interpreter.mergeInterpreted(rules,{include_closed:true}).include_closed,false);
 }
 for(const query of ['Assam including closed tenders','Nagaland historical tenders'])assert.equal(interpreter.interpretWithRules(query).include_closed,true);
});
test('a fresh search keeps the open date constraint and does not apply Gemini filters',async()=>{
 const queries=[];
 const search=compile('../lib/desk/search.js',{
  '@/lib/prisma':{prisma:{tender:{findMany:async args=>{if(args.where)queries.push(args.where);return [];}}}},
  './constants':constants,'./ist':ist,'./format':{},
  './ai/interpreter':{...interpreter,interpretQuery:async q=>({...interpreter.interpretWithRules(q),department:'PWD Roads',central:true,via:'gemini'})},
  './keywords':{listSearchKeywords:async()=>[],tenderIdsForKeywords:async()=>[]},
  './notice-facts':{departmentLabel:()=>'',readNoticeFacts:()=>({})},
 });
 const now=new Date('2026-10-01');
 const result=await search.runSearch('Assam government road construction',{id:'person'},now);
 assert.equal(result.filters.include_closed,false);assert.equal(queries.length,1);
 for(const where of queries)assert.ok(where.AND.some(part=>part.bidSubmissionEnd?.gte===now));
 assert.equal(result.rows.length,0);
 // Only typed words narrow it: the state, and "road" as text rather than a work category.
 assert.deepEqual(result.filters.states,['Assam']);
 assert.deepEqual(result.filters.work_categories,[]);
 assert.deepEqual(result.filters.keywords,['road']);
 assert.equal(result.filters.department,null);assert.equal(result.filters.central,false);
 // Gemini's reading is offered, not applied.
 const keys=result.filters.suggested.map(item=>item.key);
 for(const key of ['work_categories','department','central'])assert.ok(keys.includes(key),key);
});
