import {test} from 'node:test';import assert from 'node:assert/strict';import {sameNotice} from '../lib/desk/portal-import/notice-match.mjs';
test('PMGSY package mismatch cannot pass on generic road terms',()=>{
 assert.equal(sameNotice('Construction of Road including Cross Drainage Works and 5 Years Routine Maintenance for AS082133',{'Tender ID':'2020_CEASM_98905_1',Title:'AS-03-57(Balance Work)','Work Description':'Construction of Rural Roads including cross drainage works and Routine maintenance of the works for five years'}),false);
 assert.equal(sameNotice('Road construction AS082133',{Title:'Construction AS082133 road'}),true);
 assert.equal(sameNotice('2026_BoTC_54225_1 construction road',{Title:'construction road','Tender ID':'2025_BoTC_12345_1'}),false);
});
