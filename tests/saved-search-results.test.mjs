import test from 'node:test';
import assert from 'node:assert/strict';
import {attachSavedTenders} from '../lib/desk/portal-import/saved-search-results.mjs';
test('online rows match globally by source plus exact ID or URL in one query',async()=>{
 let calls=0;
 const rows=[{link:'https://bidplus.gem.gov.in/showbidDocument/9874034'}, {link:'https://pmgsytenders.gov.in/nicgep/app',title:'AS082133 2026_CEASM_149637_7'},{link:'https://pmgsytenders.gov.in/nicgep/app',title:'Another tender'}];
 const result=await attachSavedTenders({tender:{findMany:async args=>{calls++;assert.equal(args.where.OR.length,2);assert.equal(args.select.documents,undefined);return [{id:'gem',sourceId:'gem',sourceUrl:rows[0].link},{id:'road',sourceId:'pmgsy',portalTenderId:'2026_CEASM_149637_7'}]}}},rows);
 assert.equal(calls,1);assert.equal(result[0].existingTenderId,'gem');assert.equal(result[1].existingTenderId,'road');assert.equal(result[2].existingTenderId,undefined);
});
test('empty or unsupported results make no database call',async()=>{assert.deepEqual(await attachSavedTenders({},[]),[]);const rows=[{link:'https://example.com'}];assert.equal(await attachSavedTenders({},rows),rows);});
