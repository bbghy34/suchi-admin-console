import test from 'node:test';
import assert from 'node:assert/strict';
import {searchLiveOfficial,liveSearchTargets,liveSearchKeyword,publicKeywordForm} from '../lib/desk/portal-import/live-search.mjs';
import {PORTALS} from '../lib/desk/portal-import/identity.mjs';
const form='<form action="/nicgep/app"><input type="hidden" name="token" value="keep"><input name="SearchDescription"><input type="submit" name="Go" value="Go"></form>';
const listing='<table><tr><td>Road construction Guwahati</td><td><a href="/nicgep/app?service=direct&sp=one">Road construction Guwahati</a></td></tr></table>';
const detail=(date='05-Oct-2026 02:00 PM',title='Road construction Guwahati')=>'<table>'+Object.entries({'Tender ID':'2026_PWD_123_1','Tender Reference Number':'REF/123',Title:title,'Work Description':title,'Bid Submission End Date':date}).map(([k,v])=>`<tr><td class="td_caption">${k}</td><td class="td_field">${v}</td></tr>`).join('')+'</table><table><tr><td>1</td><td><a id="docDownoad" href="/nicgep/gate">notice.pdf</a></td><td>NIT</td><td>1</td></tr></table>';
const now=()=>Date.parse('2026-10-01T00:00:00Z');
const options=()=>({now,sleep:async()=>{},cache:new Map(),inflight:new Map()});
test('explicit state and work queries only, never GeM',async()=>{
 assert.deepEqual(liveSearchTargets('Assam and Nagaland roads').map(p=>p.id),['assam','nagaland']);
 let calls=0;const fetchImpl=async()=>{calls++;throw Error('Unexpected network');};
 for(const q of ['India roads','GeM Assam roads','Assam tenders'])assert.equal((await searchLiveOfficial(q,{fetchImpl})).rows.length,0);
 assert.equal(calls,0);
});
test('public form copies hidden state and rejects CAPTCHA or foreign action',()=>{
 const p=PORTALS.find(p=>p.id==='assam');assert.equal(publicKeywordForm(form,p,'road').fields.token,'keep');
 assert.equal(publicKeywordForm(form.replace('</form>','<input name="captchaText"></form>'),p,'road'),null);
 assert.equal(publicKeywordForm(form.replace('/nicgep/app','https://evil.test/'),p,'road'),null);
});
test('current official details verified with no CAPTCHA, cached and concurrent requests deduplicated',async()=>{
 let calls=0;const settings=options();settings.fetchImpl=async(url,opt)=>{calls++;if(opt.method==='POST'){assert.match(opt.body,/SearchDescription=road/);assert.match(opt.body,/token=keep/);}return new Response(calls===1?form:calls===2?listing:detail(),{headers:{'content-type':'text/html'}});};
 const [a,b]=await Promise.all([searchLiveOfficial('Assam roads',settings),searchLiveOfficial('Assam roads',settings)]);
 assert.equal(calls,3);assert.deepEqual(a.rows,b.rows);assert.equal(a.rows[0].portalTenderId,'2026_PWD_123_1');assert.equal(a.rows[0].site,'assamtenders.gov.in');assert.match(a.rows[0].detail,/Tender ID: 2026_PWD_123_1\n/);assert.match(a.rows[0].detail,/Closing Date: 05-Oct-2026 02:00 PM\n/);assert.equal(a.rows[0].verifiedAvailability,'available');assert.equal(a.rows[0].closingDate,'2026-10-05T08:30:00.000Z');
 const cached=await searchLiveOfficial('Assam road tenders',settings);assert.equal(calls,3);assert.equal(cached.diagnostics.portals[0].cached,true);
});
test('expired or irrelevant details never promoted as current results',async()=>{
 for(const body of [detail('01-Sep-2026 02:00 PM'),detail(undefined,'Laboratory equipment')]){
 let calls=0;const settings={...options(),fetchImpl:async()=>new Response(++calls===1?form:calls===2?listing:body,{headers:{'content-type':'text/html'}})};
 assert.deepEqual((await searchLiveOfficial('Assam roads',settings)).rows,[]);
 }
});
test('portal failure returns bounded diagnostics and is cached briefly',async()=>{
 let calls=0;const settings={...options(),fetchImpl:async()=>{calls++;return new Response('busy',{status:429});}};
 const result=await searchLiveOfficial('Assam construction',settings);assert.equal(result.rows.length,0);assert.match(result.diagnostics.portals[0].error,/busy/);
 await searchLiveOfficial('Assam construction',settings);assert.equal(calls,1);
});

test('current official listing survives detail timeout without claiming download availability',async()=>{
 const current='<table><tr><th>S.No</th><th>Closing Date</th><th>Title and Ref.No./Tender ID</th><th>Organisation Chain</th></tr><tr><td>1</td><td>22-Oct-2026 02:00 PM</td><td><a href="/nicgep/app?service=direct&sp=one">[Construction of Road and Drain][REF/123][2026_PWD_123_1]</a></td><td>PWD</td></tr></table>';
 let calls=0;const settings={...options(),fetchImpl:async()=>{calls++;if(calls===3)throw Error('Detail timed out');return new Response(calls===1?form:current,{headers:{'content-type':'text/html'}});}};
 const result=await searchLiveOfficial('Assam road',settings);assert.equal(result.rows.length,1);assert.equal(result.rows[0].portalTenderId,'2026_PWD_123_1');assert.equal(result.rows[0].reference,'REF/123');assert.equal(result.rows[0].closingDate,'2026-10-22T08:30:00.000Z');assert.equal(result.rows[0].downloadAvailability,'unverified');assert.equal(result.rows[0].discoveryMethod,'official-public-listing');assert.match(result.diagnostics.portals[0].error,/timed out/);
 await searchLiveOfficial('Assam road',settings);assert.equal(calls,3);
});

test('public keyword transport failure retries once with backoff and preserves cause code',async()=>{
 let calls=0;const sleeps=[];const settings={...options(),sleep:async ms=>sleeps.push(ms),fetchImpl:async()=>{calls++;if(calls===2)throw new TypeError('fetch failed',{cause:{code:'ECONNRESET'}});return new Response(calls===1?form:calls===3?listing:detail(),{headers:{'content-type':'text/html'}});}};
 const result=await searchLiveOfficial('Assam roads',settings);
 assert.equal(calls,4);assert.equal(result.rows.length,1);assert.equal(result.diagnostics.portals[0].searchRetries,1);assert.deepEqual(result.diagnostics.portals[0].transportErrors,['ECONNRESET']);assert(sleeps.includes(2000));
});
test('second failed keyword transport stops and GET transport failures never replay',async()=>{
 for(const failAt of [1,2]){
 let calls=0;const settings={...options(),fetchImpl:async()=>{calls++;if(calls>=failAt)throw new TypeError('fetch failed',{cause:{code:'EAI_AGAIN'}});return new Response(form,{headers:{'content-type':'text/html'}});}};
 const result=await searchLiveOfficial('Nagaland construction',settings);assert.equal(calls,failAt===1?1:3);assert.equal(result.diagnostics.portals[0].errorCode,'EAI_AGAIN');assert.equal(result.diagnostics.portals[0].searchRetries,failAt===1?0:1);
 }
});
test('public keyword cooldown response does not trigger transport retry',async()=>{
 let calls=0;const result=await searchLiveOfficial('Assam roads',{...options(),fetchImpl:async()=>++calls===1?new Response(form,{headers:{'content-type':'text/html'}}):new Response('busy',{status:429})});
 assert.equal(calls,2);assert.equal(result.diagnostics.portals[0].searchRetries,0);
});

test('specific procurement categories and aliases precede broad construction wording',()=>{
 for(const [query,keyword] of [
 ['Nagaland government furniture supply','furniture'],['Assam school chairs and desks construction','furniture'],
 ['Nagaland electronic equipment supply','equipment'],['Assam laboratory instruments','equipment'],['Nagaland computers','equipment'],
 ['Assam drinking water construction','water'],['Nagaland pipeline works','water'],
 ['Assam solar installation construction','solar'],['Nagaland photovoltaic panels','solar'],
 ['Assam road construction','road'],['Nagaland civil building work','construction'],
 ]) assert.equal(liveSearchKeyword(query),keyword,query);
 assert.equal(liveSearchKeyword('Nagaland government tenders'),null);
});
