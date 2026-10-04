import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseDefaultOfficialNotice as choose } from '../lib/desk/portal-import/default-choice.mjs';
const now = Date.parse('2026-10-01T00:00:00Z');
const candidate = (id, title, evidence='') => ({ tenderId:id, title, evidence, officialLink:`https://pmgsytenders.gov.in/nicgep/app?service=direct&page=FrontEndViewTender&sp=${id}` });
const row = {title:'Construction of Road including Cross Drainage Works and 5 Years Routine Maintenance for AS082133 NIT'};

test('PMGSY rejects wrong 2020 AS-03-57 project and selects current matching package round', () => {
  const wrong = candidate('2020_CEASM_98905_1','Construction of Road AS-03-57 (Balance Work)','Closes: 16-Sep-2020');
  const old = candidate('2026_CEASM_146895_50','Construction of Road AS-08-2133','Closing date: 10-Apr-2026');
  const current = candidate('2026_CEASM_149637_7',row.title,'Closing date: 05-Oct-2026');
  assert.equal(choose(row,[wrong,old,current],{now}).candidate,current);
  assert.equal(choose(row,[wrong],{now}),null);
});

test('exact tender ID wins without substituting a newer round', () => {
  const old = candidate('2026_CEASM_146895_50',row.title,'Closes: 10-Apr-2026');
  const current = candidate('2026_CEASM_149637_7',row.title,'Closes: 05-Oct-2026');
  assert.equal(choose({...row,portalTenderId:old.tenderId},[current,old],{now}).candidate,old);
  assert.equal(choose({...row,portalTenderId:old.tenderId},[current],{now}),null);
});

test('unknown dates or two open package rounds remain ambiguous', () => {
  const a = candidate('2026_CEASM_146895_50',row.title);
  const b = candidate('2026_CEASM_149637_7',row.title,'Closes: 05-Oct-2026');
  assert.equal(choose(row,[a,b],{now}),null);
  assert.equal(choose(row,[{...a,evidence:'Closes: 06-Oct-2026'},b],{now}),null);
});

test('single unique strong title is selected; matching title across distinct tenders is ambiguous', () => {
  const original = {title:'Guwahati laboratory optical spectrometer installation'};
  const a = candidate('2026_CEASM_100_1',original.title);
  assert.equal(choose(original,[a],{now}).confidence,'strong_title');
  assert.equal(choose(original,[a,candidate('2026_CEASM_101_1',original.title)],{now}),null);
  assert.equal(choose({title:'Construction of road'},[a],{now}),null);
});

test('aggregators, credential URLs and conflicting references cannot become default', () => {
  const exact = candidate('2026_CEASM_149637_7',row.title);
  for (const link of ['https://bidassist.com/bid.pdf','https://user:pass@pmgsytenders.gov.in/nicgep/app','https://evil.test/a.pdf']) {
    assert.equal(choose(row,[{...exact,officialLink:link}],{now}),null);
  }
  assert.equal(choose({...row,reference:'CE/PMGSY/55'},[{...exact,reference:'CE/PMGSY/03'}],{now}),null);
});

test('equivalent official URLs for same exact ID do not require a choice', () => {
  const a = candidate('2026_CEASM_149637_7',row.title);
  const b = {...a,officialLink:`${a.officialLink}&other=value`};
  assert.equal(choose({...row,portalTenderId:a.tenderId},[a,b],{now}).candidate,a);
});

test('official mirror with exact ID or reference evidence can be reused without a choice', () => {
  const mirror = {title:'Official tender notice',officialLink:'https://niperguwahati.ac.in/DOC/TENDER/notice.pdf',evidence:'Tender ID: 2026_CEASM_149637_7'};
  assert.equal(choose({portalTenderId:'2026_CEASM_149637_7'},[mirror],{now}).confidence,'exact_id');
  const byRef = {...mirror,evidence:'Tender Reference Number: CE/PMGSY/01/2025-26/55'};
  assert.equal(choose({reference:'CE/PMGSY/01/2025-26/55'},[byRef],{now}).confidence,'exact_reference');
  assert.equal(choose({reference:'CE/PMGSY/01/2025-26/03'},[byRef],{now}),null);
});
