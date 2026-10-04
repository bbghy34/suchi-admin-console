import test from 'node:test';
import assert from 'node:assert/strict';
import { officialSearchPolicy, PREFERRED_SEARCH_HOSTS } from '../lib/desk/ai/official-search-policy.mjs';
import { PORTALS } from '../lib/desk/portal-import/identity.mjs';

test('preferred search set covers every registered NIC portal plus GeM/Sikkim/NRIDA/NBCC',()=>{
 for(const portal of PORTALS)assert.ok(PREFERRED_SEARCH_HOSTS.includes(portal.host));
 for(const host of ['bidplus.gem.gov.in','www.sikkim.gov.in','pmgsy.nic.in','nbccindia.in','nbcc.enivida.com'])assert.ok(PREFERRED_SEARCH_HOSTS.includes(host));
 const policy=officialSearchPolicy('road construction in Assam');
 assert.equal(policy.queries.length,3);assert.ok(policy.queries.every(q=>q.includes('road construction in Assam')));
 assert.match(policy.instruction,/not a promise that files are downloadable/);assert.match(policy.instruction,/OMMAS monitoring records are not tender notices/);
});
test('explicit GeM request retains its portal and buyer mirror scope in every query',()=>{
 const policy=officialSearchPolicy('GeM bid Assam furniture');
 assert.ok(policy.queries.every(q=>q.includes('bidplus.gem.gov.in')));
 assert.ok(policy.queries.every(q=>!q.includes('assamtenders.gov.in')));
 assert.match(policy.instruction,/do not broaden to unrelated portals/);
});
test('explicit combined portals stay combined and standalone NRIDA is not treated as a CAPTCHA adapter',()=>{
 const mixed=officialSearchPolicy('CPPP and GeM Assam furniture');
 assert.ok(mixed.queries.every(q=>q.includes('eprocure.gov.in')&&q.includes('bidplus.gem.gov.in')));
 const nrida=officialSearchPolicy('NRIDA road construction');
 assert.ok(nrida.queries.every(q=>q.includes('pmgsy.nic.in')));
 assert.match(nrida.instruction,/not a promise/);
});
test('query strings stay inside Gemini input cap and source directives are retained',()=>{
 const policy=officialSearchPolicy('furniture '.repeat(400));
 assert.ok(policy.queries.every(q=>q.length<=2000));
 assert.ok(policy.queries.every(q=>q.includes('official')));
});
test('a place outside the Northeast is searched first instead of the Northeast portals',()=>{
 const delhi=officialSearchPolicy('hospital building in Delhi');
 assert.match(delhi.queries[0],/place the user named/);
 assert.ok(!delhi.queries[0].includes('assamtenders.gov.in'));
 assert.match(officialSearchPolicy('road construction in Assam').queries[0],/Northeast/);
});
