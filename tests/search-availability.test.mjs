import test from 'node:test';
import assert from 'node:assert/strict';
import { citedClosingStatus as status, rankByCitedClosing as rank } from '../lib/desk/portal-import/search-availability.mjs';
const now=Date.parse('2026-10-01T00:00:00Z');
test('only explicit labeled closing dates can mark search citations past',()=>{
 assert.equal(status({detail:'Closing Date: 31-Jul-2026 03:00 PM'},now).past,true);
 assert.equal(status({detail:'Bid Submission End Date: 2026-07-16'},now).past,true);
 for(const detail of ['Published: 31-Jul-2026','Tender ID: 2020_PWD_100_1','Document download end: 31-Jul-2026','Closing Date: 07/08/2026','Closing Date: 31-Feb-2026']) assert.equal(status({detail},now),null);
});
test('current day is not marked expired prematurely, unknown/conflicting dates remain unknown',()=>{
 assert.equal(status({detail:'Closing Date: 01-Oct-2026'},now).past,false);
 assert.equal(status({detail:'Closing Date: 31-Jul-2026; Due Date: 05-Oct-2026'},now),null);
 assert.equal(status({detail:'**Closing Date:** 05-Oct-2026'},now).date,'2026-10-05');
});
test('past citations move below open and unknown results without removing any source',()=>{
 const old={link:'old',detail:'Closing Date: 31-Jul-2026'}, unknown={link:'unknown'}, open={link:'open',detail:'Due Date: 05-Oct-2026'};
 assert.deepEqual(rank([old,unknown,open],now),[unknown,open,old]);
 assert.equal(status(old,now).past,true);
 assert.equal(Object.hasOwn(old,'retrievable'),false);
});
