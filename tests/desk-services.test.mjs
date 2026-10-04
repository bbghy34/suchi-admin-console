import './desk-loader.mjs';
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
if (!/^postgresql:\/\/[^@]+@(?:127\.0\.0\.1|localhost):\d+\/suchii_desk_test(?:\?|$)/.test(process.env.DATABASE_URL||'')) throw new Error('Use only the disposable local test database.');
const { prisma: db } = await import('../lib/prisma.js');
const { runSchedules } = await import('../lib/desk/scheduler.js');
const { moneyPageData } = await import('../lib/desk/desk.js');
const { refundChange, saveRefundChange, REFUND_TRANSITIONS } = await import('../lib/desk/refunds.js');
const { peopleWithRole } = await import('../lib/desk/notify.js');
const { istAt, addDaysKey } = await import('../lib/desk/ist.js');
const source=await db.source.findFirst();
const employee=await db.employee.create({data:{name:'Scheduler test',role:'A',status:true}});
const person=await db.person.create({data:{employeeId:employee.id,name:employee.name,roles:'ADMIN,ACCOUNTS'}});
const now=istAt('2026-12-15',9);
async function tender(extra={}) {return db.tender.create({data:{sourceId:source.id,title:'Service test '+randomUUID(),stage:'COMPLETED',bidSubmissionEnd:istAt('2027-01-01',15),...extra}});}
async function instrument(t, extra={}) {return db.instrument.create({data:{tenderId:t.id,category:'SD',form:'Bank guarantee',amount:101,status:'HELD',expiryDate:istAt('2027-01-14'),...extra}});}
after(()=>db.$disconnect());
test('money reminders reach Accounts with no selection; samples are excluded',async()=>{
 const t=await tender();await instrument(t);const sample=await tender({isSample:true});await instrument(sample);
 await runSchedules(now);
 assert.equal(await db.notification.count({where:{personId:person.id,tenderId:t.id,kind:'BG_EXPIRY'}}),1);
 assert.equal(await db.notification.count({where:{tenderId:sample.id}}),0);
});
test('extended bank guarantee generates new-date reminders without duplicate same-date alerts',async()=>{
 const t=await tender();const i=await instrument(t);await runSchedules(now);await runSchedules(now);
 assert.equal(await db.notification.count({where:{personId:person.id,tenderId:t.id,kind:'BG_EXPIRY'}}),1);
 await db.instrument.update({where:{id:i.id},data:{expiryDate:istAt('2027-01-21')}});
 await runSchedules(istAt('2026-12-22',9));
 assert.equal(await db.notification.count({where:{personId:person.id,tenderId:t.id,kind:'BG_EXPIRY'}}),2);
});
test('extended bid deadlines get reminders for the new date',async()=>{
 const t=await tender({stage:'SELECTED',bidSubmissionEnd:istAt('2026-12-16',15)});
 await db.selection.create({data:{tenderId:t.id,personId:person.id,frequency:'FREQUENT'}});
 await runSchedules(now);
 await db.tender.update({where:{id:t.id},data:{bidSubmissionEnd:istAt('2026-12-23',15)}});
 await runSchedules(istAt('2026-12-22',9));
 assert.equal(await db.notification.count({where:{personId:person.id,tenderId:t.id,kind:'BID_END'}}),2);
});
test('sample instruments never contribute to money totals',async()=>{
 const t=await tender({isSample:true});await instrument(t,{amount:987654321});
 const data=await moneyPageData({id:person.id,isAccounts:true,isAdmin:true});
 assert.ok(!data.projects.some(p=>p.id===t.id));
 assert.ok(data.sdTotals.held<987654321);
});
test('demoted and inactive employees do not receive Accounts notifications',async()=>{
 assert.ok((await peopleWithRole('ACCOUNTS')).includes(person.id));
 await db.employee.update({where:{id:employee.id},data:{role:'M'}});
 assert.ok(!(await peopleWithRole('ACCOUNTS')).includes(person.id));
 await db.employee.update({where:{id:employee.id},data:{role:'A',status:false}});
 assert.ok(!(await peopleWithRole('ACCOUNTS')).includes(person.id));
 await db.employee.update({where:{id:employee.id},data:{status:true}});
});
test('every invalid refund transition is rejected',()=>{
 for (const from of Object.keys(REFUND_TRANSITIONS)) for (const to of Object.keys(REFUND_TRANSITIONS)) {
  if(from===to || REFUND_TRANSITIONS[from].includes(to)) continue;
  assert.throws(()=>refundChange({status:from,instruments:[{status:'REFUND_APPLIED'}]}, {status:to,rejectNote:'test'}),/Cannot change/);
 }
});
test('batch conflict rolls back the application, attachment bytes and money',async()=>{
 const t=await tender({stage:'SD_APPLIED'});const i=await instrument(t,{status:'REFUND_APPLIED'});
 const app=await db.refundApplication.create({data:{tenderId:t.id,kind:'SD',status:'SUBMITTED',letterText:'Test',officeName:'Office',instruments:{connect:{id:i.id}}},include:{instruments:true,tender:true}});
 const change=refundChange(app,{status:'RELEASED'});
 await db.instrument.update({where:{id:i.id},data:{amount:999}});
 const documentId=randomUUID();
 await assert.rejects(saveRefundChange(app,change,person.id,{id:documentId,tenderId:t.id,type:'Refund letter',fileName:'proof.txt',file:{create:{bytes:Buffer.from('proof')}}}),e=>e.code==='P2025');
 assert.equal((await db.refundApplication.findUnique({where:{id:app.id}})).status,'SUBMITTED');
 assert.equal(await db.document.count({where:{id:documentId}}),0);
 assert.equal((await db.instrument.findUnique({where:{id:i.id}})).status,'REFUND_APPLIED');
});

test('stale stage change does not save its evidence or history', async () => {
 const { saveTenderTransition } = await import('../lib/desk/tender-transition.js');
 const t = await tender({stage:'BID_SUBMITTED'});
 await db.tender.update({where:{id:t.id},data:{stage:'NOT_AWARDED'}});
 const documentId=randomUUID();
 await assert.rejects(saveTenderTransition(t,person.id,{stage:'GOT_THE_BID'},{action:'must not save'},
  {id:documentId,type:'Work order',fileName:'conflict.txt',file:{create:{bytes:Buffer.from('test')}}}),e=>e.code==='P2025');
 assert.equal((await db.tender.findUnique({where:{id:t.id}})).stage,'NOT_AWARDED');
 assert.equal(await db.document.count({where:{id:documentId}}),0);
 assert.equal(await db.activity.count({where:{tenderId:t.id,action:'must not save'}}),0);
});

test('invalid activity rolls back stage and evidence together', async () => {
 const { saveTenderTransition } = await import('../lib/desk/tender-transition.js');
 const t=await tender({stage:'BID_SUBMITTED'});const documentId=randomUUID();
 await assert.rejects(saveTenderTransition(t,randomUUID(),{stage:'GOT_THE_BID'},{action:'invalid actor'},
  {id:documentId,type:'Work order',fileName:'rollback.txt',file:{create:{bytes:Buffer.from('test')}}}));
 assert.equal((await db.tender.findUnique({where:{id:t.id}})).stage,'BID_SUBMITTED');
 assert.equal(await db.document.count({where:{id:documentId}}),0);
});

test('concurrent first selection persists one selection, activity and notification atomically', async () => {
 const { selectTender }=await import('../lib/desk/tender-service.js');
 const t=await tender({stage:'UPLOADED',summaryJson:'{}'});
 const results=await Promise.all([selectTender(t.id,person),selectTender(t.id,person)]);
 assert.equal(results[0].selection.id,results[1].selection.id);
 assert.equal(await db.selection.count({where:{tenderId:t.id,personId:person.id}}),1);
 assert.equal(await db.activity.count({where:{tenderId:t.id,action:'selected'}}),1);
 assert.equal(await db.notification.count({where:{tenderId:t.id,kind:'SELECTED'}}),1);
 assert.equal((await db.tender.findUnique({where:{id:t.id}})).stage,'SELECTED');
});

test('failed first selection leaves stage and history unchanged', async () => {
 const { selectTender }=await import('../lib/desk/tender-service.js');
 const t=await tender({stage:'UPLOADED',summaryJson:'{}'});
 await assert.rejects(selectTender(t.id,{id:randomUUID(),name:'Missing person'}));
 assert.equal((await db.tender.findUnique({where:{id:t.id}})).stage,'UPLOADED');
 assert.equal(await db.selection.count({where:{tenderId:t.id}}),0);
 assert.equal(await db.activity.count({where:{tenderId:t.id}}),0);
 assert.equal(await db.notification.count({where:{tenderId:t.id}}),0);
});
