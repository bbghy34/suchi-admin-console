import test from 'node:test';
import assert from 'node:assert/strict';
import {preferredOfficialResult as preferred,filterPreferredSearchResults as filter} from '../lib/desk/portal-import/preferred-search-results.mjs';
const now=Date.parse('2026-10-01T00:00:00Z');
test('listed portals and their official state/PSU originals are accepted, commercial mirrors excluded',()=>{
 for(const link of ['https://assamtenders.gov.in/nicgep/app','https://nagalandtenders.gov.in/nicgep/app','https://pwd.assam.gov.in/notice.pdf','https://nbccindia.in/notice.pdf','https://pmgsy.nic.in/notice','https://nhidcl.com/tenders','https://defproc.gov.in/nicgep/app'])assert.equal(preferred({link,portalTenderId:'2026_PWD_100_1'}),true,link);
 for(const link of ['https://infralens.com/tender','https://tenderdetail.com/tender','https://assamtenders.gov.in.evil.test/tender','https://user:pass@assamtenders.gov.in/','https://other.example/notice.pdf'])assert.equal(preferred({link}),false,link);
 assert.equal(preferred({link:'https://niperguwahati.ac.in/notice.pdf',detail:'Bid GEM/2026/B/8020218'}),true);
});
test('closed citation filter respects explicit historic request; ID year alone never invents closure',()=>{
 const old={link:'https://assamtenders.gov.in/nicgep/app',detail:'Tender ID: 2025_PWD_47610_2. Closing Date: 07-Oct-2025'};
 const unknown={link:'https://nagalandtenders.gov.in/nicgep/app',detail:'Tender ID: 2019_PWD_1_1'};
 assert.deepEqual(filter([old,unknown],{now}),[unknown]);
 assert.deepEqual(filter([old,unknown],{now,includeClosed:true}),[old,unknown]);
});

test('generic GePNIC navigation pages are not repeated as tender cards without an exact ID',()=>{
 const title='Supply furniture for Nagaland schools';
 for(const link of ['https://nagalandtenders.gov.in/','https://nagalandtenders.gov.in/nicgep/app?page=FrontEndTendersByOrganisation&service=page','https://nagalandtenders.gov.in/nicgep/app?page=FrontEndAdvancedSearch&service=page']) {
  assert.equal(preferred({link,title}),false);
  assert.equal(preferred({link,title,detail:'Tender ID: 2026_DSE_839_1'}),true);
 }
 assert.equal(preferred({link:'https://nagalandtenders.gov.in/nicgep/app?page=FrontEndViewTender&service=direct&sp=abc',title}),true);
 assert.equal(preferred({link:'https://education.nagaland.gov.in/furniture.pdf',title}),true);
});
