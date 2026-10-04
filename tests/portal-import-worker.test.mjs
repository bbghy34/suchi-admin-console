import './desk-loader.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {PrismaClient} from '@prisma/client';
import {enqueueJob,getJob,finishJob} from '../lib/desk/portal-import/jobs.mjs';
const {executeImportJob} = await import('../lib/desk/portal-import/job-worker.js');
const url=process.env.WORKFORCE_TEST_DATABASE_URL;
if(url&&!/^postgresql:\/\/[^@]+@(?:127\.0\.0\.1|localhost):\d+\/suchii_desk_test(?:\?|$)/.test(url))throw Error('Use disposable local database');
test('worker persists progress/results and notifies once without storing a session',{skip:!url},async()=>{
 const db=new PrismaClient({datasourceUrl:url});
 try{await assert.rejects(db.$transaction(async tx=>{
  const employee=await tx.employee.create({data:{name:'Background worker QA',role:'A',status:true}});
  const person=await tx.person.create({data:{employeeId:employee.id,name:employee.name,roles:'ADMIN'}});
  const source=await tx.source.findFirst();
  const tender=await tx.tender.create({data:{sourceId:source.id,title:'Job test '+randomUUID(),bidSubmissionEnd:new Date()}});
  const created=await enqueueJob(tx,person.id,{link:'https://assamtenders.gov.in/nicgep/app',tenderId:'2026_TEST_123_1'});
  let calls=0;
  const run=async(request,progress,{actor,requestId})=>{calls++;assert.equal(actor.id,person.id);assert.equal(request.headers.get('cookie'),null);assert.equal(requestId,created.job.id);progress({message:'Downloading test original'});await new Promise(r=>setTimeout(r,25));return Response.json({ok:true,tenderId:tender.id,documentCount:1});};
  let completions=0;
  await executeImportJob(created.job.id,{db:tx,run,heartbeatMs:5,completionRetryMs:1,complete:async(...args)=>{if(++completions===1)throw Error('Temporary completion outage');return finishJob(...args);}});
  assert.equal(completions,2);
  await executeImportJob(created.job.id,{db:tx,run,heartbeatMs:5});
  assert.equal(calls,1);const done=await getJob(tx,created.job.id,person.id);assert.equal(done.status,'SUCCEEDED');assert.equal(done.resultJSON.tenderId,tender.id);
  assert.equal(await tx.notification.count({where:{dedupeKey:`portal-job:${created.job.id}:terminal`}}),1);
  const blocked=await enqueueJob(tx,person.id,{link:'https://assamtenders.gov.in/nicgep/app',tenderId:'2026_TEST_124_1'});
  await tx.employee.update({where:{id:employee.id},data:{status:false}});
  await executeImportJob(blocked.job.id,{db:tx,run,heartbeatMs:5});assert.equal(calls,1);assert.equal((await getJob(tx,blocked.job.id,person.id)).status,'FAILED');
  throw Error('ROLLBACK_WORKER_QA');
 }),/ROLLBACK_WORKER_QA/);}finally{await db.$disconnect();}
});

test('worker follows an exact official source automatically within one deadline',{skip:!url},async()=>{
 const db=new PrismaClient({datasourceUrl:url});
 try{await assert.rejects(db.$transaction(async tx=>{
  const employee=await tx.employee.create({data:{name:'Automatic selection QA',role:'A',status:true}});
  const person=await tx.person.create({data:{employeeId:employee.id,name:employee.name,roles:'ADMIN'}});
  const original={title:'AS082133',link:'https://pmgsytenders.gov.in/nicgep/app',portalTenderId:'2026_CEASM_149637_7'};
  const queued=await enqueueJob(tx,person.id,{row:original});let calls=0,deadline;
  await executeImportJob(queued.job.id,{db:tx,run:async(request,progress,options)=>{
   calls++;if(!deadline)deadline=options.deadlineAt;assert.equal(options.deadlineAt,deadline);
   if(calls===1)return Response.json({ok:true,needsChoice:true,matches:[{title:'AS082133',tenderId:'2026_CEASM_149637_7',officialLink:'https://pmgsytenders.gov.in/nicgep/app'}]});
   const payload=await request.json();assert.equal(payload.row.portalTenderId,original.portalTenderId);
   return Response.json({ok:true,documentCount:1});
  }});
  assert.equal(calls,2);assert.equal((await getJob(tx,queued.job.id,person.id)).status,'SUCCEEDED');
  const ambiguous=await enqueueJob(tx,person.id,{row:original});calls=0;
  await executeImportJob(ambiguous.job.id,{db:tx,run:async()=>{calls++;return Response.json({ok:true,needsChoice:true,matches:[{title:'Different package AS0357',tenderId:'2020_CEASM_98905_1',officialLink:'https://pmgsytenders.gov.in/nicgep/app'}]});}});
  assert.equal(calls,1);const failed=await getJob(tx,ambiguous.job.id,person.id);assert.equal(failed.status,'FAILED');assert.equal(failed.result.needsChoice,undefined);
  throw Error('ROLLBACK_AUTO_SELECTION');
 }),/ROLLBACK_AUTO_SELECTION/);}finally{await db.$disconnect()}
});
