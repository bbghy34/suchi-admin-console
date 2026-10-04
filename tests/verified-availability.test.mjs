import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recordVerifiedUnavailable, applyVerifiedAvailability, clearVerifiedUnavailable, verifiedAvailabilityKeys, VERIFIED_AVAILABILITY_TTL_MS } from '../lib/desk/portal-import/verified-availability.mjs';
const now=Date.parse('2026-10-01T00:00:00Z');
const evidence={code:'SOURCE_DOWNLOAD_UNAVAILABLE',sourceHost:'assamtenders.gov.in',tenderId:'2026_TEST_123_1',originalUrl:'https://assamtenders.gov.in/nicgep/app?service=direct&sp=S123',resolvedUrl:'https://assamtenders.gov.in/nicgep/app?sp=S456&service=direct',downloadEnd:'30-Sep-2026 04:00 PM'};
function fakeDB(){const records=new Map();let reads=0;return {records,get reads(){return reads},$transaction:tasks=>Promise.all(tasks),setting:{upsert:async({where,create,update})=>records.set(where.key,records.has(where.key)?update.value:create.value),deleteMany:async({where})=>where.key.in.forEach(k=>records.delete(k)),findMany:async({where})=>{reads++;return where.key.in.filter(k=>records.has(k)).map(key=>({key,value:records.get(key)}));}}};}
test('authoritative evidence matches exact identity and both URLs using one batch read',async()=>{
 const db=fakeDB();assert.equal(await recordVerifiedUnavailable(db,evidence,{now}),true);
 const rows=[{sourceId:'assam',portalTenderId:evidence.tenderId},{link:evidence.originalUrl},{link:evidence.resolvedUrl},{link:'https://assamtenders.gov.in/nicgep/app?service=direct&sp=other'}];
 assert.deepEqual(await applyVerifiedAvailability(db,rows,{now}),[rows[3]]);assert.equal(db.reads,1);
 const annotated=await applyVerifiedAvailability(db,rows,{now,includeClosed:true});assert.equal(annotated.length,4);assert.equal(annotated[0].verifiedAvailability.downloadEnd,evidence.downloadEnd);assert.equal(rows[0].verifiedAvailability,undefined);
});
test('expiry, different identity and saved files never disappear',async()=>{
 const db=fakeDB();await recordVerifiedUnavailable(db,evidence,{now});
 const rows=[{link:evidence.originalUrl,portalTenderId:'2026_TEST_999_1'},{link:evidence.originalUrl,recordKind:'internal'},{link:evidence.originalUrl,files:[{id:'saved',fileName:'notice.pdf'}]}];
 assert.deepEqual(await applyVerifiedAvailability(db,rows,{now}),rows);
 const expired=[{link:evidence.originalUrl}];assert.deepEqual(await applyVerifiedAvailability(db,expired,{now:now+VERIFIED_AVAILABILITY_TTL_MS}),expired);
});
test('CAPTCHA and timeouts cannot be cached; generic portal URLs cannot hide other tenders',async()=>{
 const db=fakeDB();for(const code of ['CAPTCHA_FAILED','RETRIEVAL_TIMEOUT','HTTP_503'])assert.equal(await recordVerifiedUnavailable(db,{...evidence,code},{now}),false);
 assert.equal(db.records.size,0);assert.deepEqual(verifiedAvailabilityKeys({link:'https://assamtenders.gov.in/nicgep/app?page=Home&service=page'}),[]);
});
test('successful retrieval invalidates keys and unavailable cache cannot break search',async()=>{
 const db=fakeDB();await recordVerifiedUnavailable(db,evidence,{now});await clearVerifiedUnavailable(db,evidence);assert.equal(db.records.size,0);
 const rows=[{link:evidence.originalUrl}];db.setting.findMany=async()=>{throw Error('offline')};assert.deepEqual(await applyVerifiedAvailability(db,rows,{now}),rows);
});
test('same tender IDs on different hosts do not collide and query order normalizes',()=>{
 assert.notEqual(verifiedAvailabilityKeys({sourceHost:'assamtenders.gov.in',tenderId:evidence.tenderId})[0],verifiedAvailabilityKeys({sourceHost:'tripuratenders.gov.in',tenderId:evidence.tenderId})[0]);
 assert.deepEqual(verifiedAvailabilityKeys({link:evidence.originalUrl}),verifiedAvailabilityKeys({link:'http://assamtenders.gov.in/nicgep/app?sp=S123&service=direct#top'}));
});
test('malformed and future-dated cache entries do not hide results',async()=>{
 const db=fakeDB(), rows=[{link:evidence.originalUrl}];const [key]=verifiedAvailabilityKeys(rows[0]);
 for(const value of ['{broken',JSON.stringify({status:'unavailable',checkedAt:new Date(now).toISOString()}),JSON.stringify({schemaVersion:1,status:'unavailable',tenderId:evidence.tenderId,checkedAt:new Date(now+1000).toISOString()})]){
  db.records.set(key,value);assert.deepEqual(await applyVerifiedAvailability(db,rows,{now}),rows);
 }
});
test('attached saved tender remains visible despite a stale unavailable record',async()=>{
 const db=fakeDB();await recordVerifiedUnavailable(db,evidence,{now});
 const rows=[{link:evidence.originalUrl,portalTenderId:evidence.tenderId,existingTenderId:'saved-tender'}];
 assert.deepEqual(await applyVerifiedAvailability(db,rows,{now}),rows);
 assert.equal(db.reads,0);
});
