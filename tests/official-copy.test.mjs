import test from 'node:test';
import assert from 'node:assert/strict';
import { findOfficialCopies } from '../lib/desk/portal-import/official-copy.mjs';
const fields = { 'Tender ID': '2026_PWD_54237_1', 'Tender Reference Number': 'PWD/RD/123/2026', Title: 'Bridge repairs' };
const original = 'https://assamtenders.gov.in/nicgep/app?service=direct&sp=old';

test('one bounded search offers official files and pages with exact identifier evidence', async () => {
  let calls = 0;
  const rows = [
    {title:'Notice 2026-PWD-54237-1',link:'https://pwd.assam.gov.in/notice.pdf',detail:'Bridge repairs'},
    {title:'Official copy',link:'https://pwd.assam.gov.in/notices/bridge',detail:'PWD-RD-123-2026'},
  ];
  const result = await findOfficialCopies(fields,original,async query => {calls++; assert(query.includes(fields['Tender ID']));assert(query.includes(fields['Tender Reference Number']));return {rows};});
  assert.equal(calls,1);assert.equal(result.length,2);
  assert.equal(result[0].officialLink,rows[0].link);
  assert.match(result[0].evidence,/still needs verification/);
  assert.equal(result[1].reference,fields['Tender Reference Number']);
});

test('excludes portal sessions, same source, aggregators, unsafe links and identity near misses', async () => {
  const links = [original,'https://tripuratenders.gov.in/nicgep/app?service=direct&sp=x','https://aggregator.example/copy.pdf','http://127.0.0.1/copy.pdf','https://pwd.assam.gov.in:444/copy.pdf','https://pwd.assam.gov.in@evil.example/copy.pdf'];
  const rows = links.map(link => ({link,detail:fields['Tender ID']}));
  rows.push({link:'https://pwd.assam.gov.in/wrong.pdf',detail:'2026_PWD_54237_12 PWD/RD/123/20260'});
  rows.push({link:'https://pwd.assam.gov.in/title-only.pdf',title:fields.Title});
  assert.deepEqual(await findOfficialCopies(fields,original,async()=>({rows})),[]);
  assert.deepEqual(await findOfficialCopies(fields,'https://pwd.assam.gov.in/same.pdf#page=1',async()=>({rows:[{link:'https://pwd.assam.gov.in/same.pdf',detail:fields['Tender ID']}]})),[]);
});

test('deduplicates and returns at most three named choices including linked official documents', async () => {
  const rows = [{link:'https://aggregator.example/record',detail:fields['Tender ID'],documents:[{url:'https://pwd.assam.gov.in/a.pdf'}]},...['a','b','c','d'].map(n=>({link:`https://pwd.assam.gov.in/${n}.pdf`,detail:fields['Tender ID']}))];
  const result=await findOfficialCopies(fields,original,async()=>({rows}));
  assert.equal(result.length,3);assert.equal(new Set(result.map(r=>r.officialLink)).size,3);assert(result.every(r=>r.title));
});

test('no usable confirmed identifier means no model call; malformed output is empty', async () => {
  let calls=0;const search=async()=>{calls++;return {rows:null};};
  assert.deepEqual(await findOfficialCopies({Title:'Bridge','Tender Reference Number':'123'},original,search),[]);assert.equal(calls,0);
  assert.deepEqual(await findOfficialCopies(fields,original,search),[]);assert.equal(calls,1);
});

test('does not conceal search failure or retry it',async()=>{
  let calls=0;
  await assert.rejects(findOfficialCopies(fields,original,async()=>{calls++;throw Error('Search unavailable');}),/Search unavailable/);
  assert.equal(calls,1);
});
