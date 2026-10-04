import {test} from 'node:test';import assert from 'node:assert/strict';import{rankRows}from'../lib/desk/portal-import/source-rank.mjs';
test('verified direct files and exact-ID CAPTCHA portals precede generic pages',()=>{
 const rows=rankRows([{link:'https://pwdroads.assam.gov.in/'},{link:'https://assamtenders.gov.in/nicgep/app',detail:'2026_BoTC_54225_1'},{link:'https://niperguwahati.ac.in/DOC/TENDER/GeM-Bidding-9874034.pdf'},{link:'https://bidplus.gem.gov.in/showbidDocument/9874034'}]);
 assert.match(rows[0].link,/bidplus/);assert.match(rows[1].link,/niperguwahati/);assert.match(rows[2].link,/assamtenders/);assert.match(rows[3].link,/pwdroads/);
});
test('aggregator duplicate is omitted when official GeM bid is present',()=>{
 const rows=rankRows([{link:'https://asiantender.com/tender-summary/58989521',detail:'GEM/2026/B/8020218'},{link:'https://bidplus.gem.gov.in/showbidDocument/9874034',detail:'GEM/2026/B/8020218'}]);assert.equal(rows.length,1);
});
