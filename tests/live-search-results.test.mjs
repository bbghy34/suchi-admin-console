import test from 'node:test';import assert from 'node:assert/strict';
import {matchesLiveSearch as matches,mergeLiveSearchRows as merge} from '../lib/desk/portal-import/live-search-results.mjs';
const now=Date.parse('2026-10-01T00:00:00Z');
const row={title:'Construction of road in Kohima',detail:'Public Works Department',state:'Nagaland',sourceId:'nagaland',link:'https://nagalandtenders.gov.in/nicgep/app?sp=current',portalTenderId:'2026_PWD_100_1',closingDate:'2026-10-10T10:00:00Z',downloadAvailability:'available'};
test('live verified result must match requested location and work, not just portal or broad category',()=>{
 assert.equal(matches(row,'Nagaland government road construction',{},now),true);
 assert.equal(matches(row,'Nagaland Dimapur road construction',{},now),false);
 assert.equal(matches(row,'Nagaland furniture supply',{},now),false);
 assert.equal(matches({...row,downloadAvailability:'unavailable'},'Nagaland road',{},now),false);
});
test('date, source, category, amount and document filters are not silently ignored',()=>{
 for(const filter of [{closing_within_days:2},{sources:['assam']},{states:['Assam']},{category:'Goods'},{amount_min:100},{has_boq:true},{central:true},{scheme:'PMGSY'}])assert.equal(matches(row,'Nagaland road',filter,now),false,JSON.stringify(filter));
 assert.equal(matches(row,'Nagaland road',{closing_within_days:15,work_categories:['Roads and bridges'],has_documents:true},now),true);
});
test('verified current row replaces duplicate stale AI link for same portal/tender',()=>{
 const stale={...row,title:'Stale title',link:'https://nagalandtenders.gov.in/nicgep/app?sp=expired'};
 assert.deepEqual(merge([row],[stale]),[row]);
});
test('current official listing can lead unknown citations without claiming file availability',()=>{
 const listing={...row,downloadAvailability:'unverified',discoveryMethod:'official-public-listing'};
 assert.equal(matches(listing,'Nagaland road',{},now),true);
 assert.equal(matches(listing,'Nagaland road',{has_documents:true},now),false);
 assert.equal(matches({...listing,discoveryMethod:'gemini'},'Nagaland road',{},now),false);
 assert.equal(matches({...listing,closingDate:'2026-07-13T10:00:00Z'},'Nagaland road',{},now),false);
});
test('portal failure diagnostics distinguish incomplete checks from no matching notices',async()=>{
 const {officialSearchProblem,officialSearchProblemMessage}=await import('../lib/desk/portal-import/live-search-results.mjs');
 assert.equal(officialSearchProblem({portals:[{error:'fetch failed'}]}),true);
 assert.equal(officialSearchProblem({error:'overall timeout'}),true);
 assert.equal(officialSearchProblem({portals:[{checked:0,error:null}]}),false);
 assert.match(officialSearchProblemMessage(false),/does not mean there are no matching tenders/);
 assert.match(officialSearchProblemMessage(true),/Retrieved results are shown/);
});
test('successful current Nagaland listing suppresses undated stale same-portal citations only',async()=>{
 const {preferCheckedPortalListings:filter}=await import('../lib/desk/portal-import/live-search-results.mjs');
 const stale={link:'https://nagalandtenders.gov.in/nicgep/app?sp=old',detail:'Tender ID: 2026_NUIDP_820_1'};
 const future={...stale,link:'https://nagalandtenders.gov.in/nicgep/app?sp=new',detail:'Closing Date: 06-Oct-2026'};
 const other={link:'https://eprocure.gov.in/eprocure/app?sp=other',detail:'Nagaland road construction'};
 const saved={...stale,existingTenderId:'saved-record'};
 const current={...row,discoveryMethod:'official-public-listing',downloadAvailability:'unverified'};
 const diagnostics={portals:[{sourceId:'nagaland',error:null,requests:2,checked:0}]};
 assert.deepEqual(filter([stale,future,other,saved,current],diagnostics,{now}),[future,other,saved,current]);
 assert.deepEqual(filter([stale],diagnostics,{now,includeClosed:true}),[stale]);
 assert.deepEqual(filter([stale],{portals:[{sourceId:'nagaland',error:'fetch failed',requests:2}]},{now}),[stale]);
 assert.deepEqual(filter([stale],{portals:[{sourceId:'nagaland',error:null,requests:1}]},{now}),[stale]);
});
test('parsed closing phrases do not become title keywords, while work and location remain required',()=>{
 const soon={...row,closingDate:'2026-10-03T10:00:00Z'};
 const filters={keywords:['road'],closing_within_days:7};
 for(const query of ['Nagaland road tenders closing this week','Nagaland road tenders closing in 7 days','Nagaland road tenders within 7 days','Nagaland Kohima road tenders this week'])assert.equal(matches(soon,query,filters,now),true,query);
 assert.equal(matches(soon,'Nagaland Dimapur road tenders closing this week',filters,now),false);
 assert.equal(matches(soon,'Nagaland furniture tenders closing this week',{...filters,keywords:['furniture']},now),false);
 assert.equal(matches(row,'Nagaland road tenders closing this week',filters,now),false,'Actual closing date must still satisfy parsed deadline');
});
