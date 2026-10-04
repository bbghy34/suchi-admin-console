import {test} from 'node:test';import assert from 'node:assert/strict';import {matchesRequestedPortal as match} from '../lib/desk/portal-import/search-scope.mjs';
test('GeM furniture search excludes state notices but keeps GeM and buyer mirrors',()=>{
 const q='GeM bid Assam furniture supply';assert.equal(match(q,{link:'https://assamtenders.gov.in/nicgep/app',detail:'Classroom furniture 2025_DU_43889_1'}),false);
 assert.equal(match(q,{link:'https://bidplus.gem.gov.in/showbidDocument/9874034'}),true);
 assert.equal(match(q,{link:'https://niperguwahati.ac.in/DOC/TENDER/GeM-Bidding-9874034.pdf',detail:'GEM/2026/B/8020218'}),true);
 assert.equal(match('Assam furniture',{link:'https://assamtenders.gov.in'}),true);
 assert.equal(match('GeM and CPPP furniture',{link:'https://eprocure.gov.in'}),true);
});

test('explicit combined GeM and preferred portals are preserved without broadening GeM-only Assam',()=>{
 const nbcc={link:'https://nbccindia.in/tender.pdf',title:'Furniture procurement'};
 for(const query of ['GeM and NBCC furniture','GeM + NTPC office furniture','GeM and tripuratenders.gov.in furniture','GeM and NRIDA procurement']) assert.equal(match(query,nbcc),true);
 assert.equal(match('GeM bid Assam furniture supply',nbcc),false);
});
