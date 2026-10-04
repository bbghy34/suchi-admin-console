import './desk-loader.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { acquirePortalLease, releasePortalLease } from '../lib/desk/portal-import/store.mjs';
const url=process.env.WORKFORCE_TEST_DATABASE_URL;
if(url&&!/^postgresql:\/\/[^@]+@(?:127\.0\.0\.1|localhost):\d+\/suchii_desk_test(?:\?|$)/.test(url))throw Error('Use disposable local database');
test('real PostgreSQL leases allow two concurrent owners and share upstream cooldown',{skip:!url},async()=>{
 const db=new PrismaClient({datasourceUrl:url});
 const source='queue-test-'+randomUUID(), prefix=`portalImport:${source}:`;
 try {
  const attempts=await Promise.allSettled(Array.from({length:3},()=>acquirePortalLease(db,source)));
  const acquired=attempts.filter(r=>r.status==='fulfilled').map(r=>r.value);
  assert.equal(acquired.length,2);
  assert.equal(attempts.find(r=>r.status==='rejected').reason.code,'PORTAL_BUSY');
  const retryAt=Date.now()+60000;
  await releasePortalLease(db,acquired[0],retryAt,source);
  await assert.rejects(acquirePortalLease(db,source),e=>e.code==='PORTAL_COOLDOWN'&&e.retryAt===retryAt);
  // A stale owner cannot overwrite the cooldown; the other owner cannot shorten it.
  await releasePortalLease(db,acquired[0],retryAt+60000,source);
  await releasePortalLease(db,acquired[1],retryAt-10000,source);
  await assert.rejects(acquirePortalLease(db,source),e=>e.code==='PORTAL_COOLDOWN'&&e.retryAt===retryAt);
  await db.setting.update({where:{key:prefix+'cooldown'},data:{value:'1'}});
  for(const key of [prefix+'lease',prefix+'lease:slot:1'])await db.setting.update({where:{key},data:{value:'1|expired'}});
  assert.ok(await acquirePortalLease(db,source));
 } finally {
  await db.setting.deleteMany({where:{key:{startsWith:prefix}}});
  await db.$disconnect();
 }
});
