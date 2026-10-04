import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { validateJobPayload, publicJob, enqueueJob, claimJob, heartbeatJob, finishJob, getJob, listJobs, getOwnedJobInput, recoverInterruptedJobs, JOB_STALE_MS } from '../lib/desk/portal-import/jobs.mjs';

test('job input is bounded and rejects credentials and malformed input',()=>{
 assert.throws(()=>validateJobPayload({link:'https://example.com',cookie:'secret'}));
 assert.throws(()=>validateJobPayload({link:'x',query:'x'.repeat(20001)}),e=>e.status===413);
 assert.throws(()=>validateJobPayload({row:'bad'}));
 assert.deepEqual(validateJobPayload({query:'road',row:{title:'road',detail:'official'}}),{query:'road',row:{detail:'official',title:'road'}});
 assert.throws(()=>validateJobPayload({row:{title:'road',cookie:'secret'}}));
 assert.throws(()=>validateJobPayload({row:{title:'road',documents:[{url:'x',token:'secret'}]}}));
 assert.throws(()=>validateJobPayload({link:'x',mode:'resolve'}));
 assert.deepEqual(validateJobPayload({row:{title:'road',reference:null,documents:null}}),{row:{title:'road'}});
});
test('public jobs do not disclose owner, payload, worker token or result secrets',()=>{
 const job=publicJob({id:'job',status:'RUNNING',ownerId:'private',claimToken:'secret',payload:{query:'road',link:'privateurl'},result:{ok:true,token:'secret',ownerId:'private',matches:[{title:'road',cookie:'secret'}]},startedAt:'2026-01-01T00:00:00.000Z'},Date.parse('2026-01-01T00:00:01.000Z'));
 assert.equal(job.query,'road');assert.equal(job.elapsedMs,1000);
 assert.ok(!JSON.stringify(job).includes('secret'));assert.ok(!JSON.stringify(job).includes('private'));
});

test('durable jobs deduplicate, fence workers, notify once and interrupt without replay', {skip:!process.env.WORKFORCE_TEST_DATABASE_URL},async()=>{
 const {PrismaClient}=await import('@prisma/client');const db=new PrismaClient({datasourceUrl:process.env.WORKFORCE_TEST_DATABASE_URL});
 try{await assert.rejects(db.$transaction(async tx=>{
  await tx.setting.create({data:{key:'job-test-plain-'+Date.now(),value:'non-json setting'}});
  const owner=await tx.person.create({data:{name:'Job isolation owner',roles:'ADMIN'}});
  const input={link:'https://bidplus.gem.gov.in/showbidDocument/9780729',query:'road'};const now=Date.now();
  const first=await enqueueJob(tx,owner.id,input,{now});
  const duplicate=await enqueueJob(tx,owner.id,{query:'road',link:input.link},{now});
  assert.equal(first.job.id,duplicate.job.id);assert.equal(duplicate.existing,true);
  assert.equal(await getJob(tx,first.job.id,'another-owner'),null);
  assert.equal(await getOwnedJobInput(tx,first.job.id,'another-owner'),null);
  const claims=await Promise.all([claimJob(tx,first.job.id,{now}),claimJob(tx,first.job.id,{now})]);
  assert.equal(claims.filter(Boolean).length,1);const claimed=claims.find(Boolean);
  assert.equal(await heartbeatJob(tx,claimed.id,'wrong','bad'),false);
  assert.equal(await heartbeatJob(tx,claimed.id,claimed.claimToken,{message:'Solving CAPTCHA challenge 2',stage:'captcha',captchaAttempt:2},{now:now+100}),true);
  const staged=await getJob(tx,claimed.id,owner.id,{now:now+100});
  assert.equal(staged.stage,'captcha');assert.equal(staged.captchaAttempt,2);assert.equal(staged.stageHistory.length,2);
  await heartbeatJob(tx,claimed.id,claimed.claimToken,undefined,{now:now+200});
  assert.equal((await getJob(tx,claimed.id,owner.id,{now:now+200})).stageHistory.length,2);
  const finished=await finishJob(tx,claimed.id,claimed.claimToken,{ok:true},{now:now+1000});
  assert.equal(finished.status,'SUCCEEDED');
  assert.equal(await finishJob(tx,claimed.id,claimed.claimToken,{ok:true}),null);
  assert.equal(await tx.notification.count({where:{personId:owner.id}}),1);
  const second=await enqueueJob(tx,owner.id,input,{now:now+2000});
  assert.notEqual(second.job.id,first.job.id);
  const secondClaim=await claimJob(tx,second.job.id,{now:now+2000});
  assert.equal(await recoverInterruptedJobs(tx,owner.id,{now:now+2000+JOB_STALE_MS+1}),1);
  assert.equal((await getJob(tx,second.job.id,owner.id)).status,'INTERRUPTED');
  assert.equal(await claimJob(tx,second.job.id),null);
  assert.equal(await finishJob(tx,second.job.id,secondClaim.claimToken,{ok:true}),null);
  assert.deepEqual(await getOwnedJobInput(tx,second.job.id,owner.id),input);
  const choice=await enqueueJob(tx,owner.id,input,{now:now+3000});const c=await claimJob(tx,choice.job.id,{now:now+3000});
  assert.equal((await finishJob(tx,c.id,c.claimToken,{ok:true,needsChoice:true,matches:[]})).status,'NEEDS_INPUT');
  assert.equal((await listJobs(tx,owner.id)).length,3);
  for(let n=0;n<3;n++) await enqueueJob(tx,owner.id,{...input,query:'q'+n},{now});
  await assert.rejects(enqueueJob(tx,owner.id,{...input,query:'over-limit'},{now}),e=>e.status===429);
  assert.equal(await recoverInterruptedJobs(tx,owner.id,{now:now+JOB_STALE_MS+1}),3);
  assert.equal(await tx.notification.count({where:{personId:owner.id}}),6);
  throw new Error('ROLLBACK_JOB_FIXTURES');
 },{timeout:15000}),/ROLLBACK_JOB_FIXTURES/);}finally{await db.$disconnect();}
});

test('completion retries a heartbeat CAS race without duplicating notification',async()=>{
 const id='11111111-1111-4111-8111-111111111111';
 let row=JSON.stringify({id,status:'RUNNING',ownerId:'owner',claimToken:'worker',startedAt:new Date().toISOString()});
 let updates=0,notifications=0;
 const db={setting:{findUnique:async()=>({value:row}),updateMany:async args=>{
  updates++;
  if(updates===1){row=JSON.stringify({...JSON.parse(row),heartbeatAt:new Date().toISOString()});return {count:0};}
  if(args.where.value!==row)return {count:0};row=args.data.value;return {count:1};
 }},notification:{upsert:async()=>{notifications++;}}};
 assert.equal((await finishJob(db,id,'worker',{ok:true})).status,'SUCCEEDED');
 assert.equal(updates,2);assert.equal(notifications,1);
});

test('active jobs remain visible when newer completed jobs exceed the history limit', {skip:!process.env.WORKFORCE_TEST_DATABASE_URL},async()=>{
 const {PrismaClient}=await import('@prisma/client');const db=new PrismaClient({datasourceUrl:process.env.WORKFORCE_TEST_DATABASE_URL});
 try{await assert.rejects(db.$transaction(async tx=>{
  const owner=await tx.person.create({data:{name:'Job history owner',roles:'ADMIN'}});
  const now=Date.now();const activeIds=[];
  for(let n=0;n<24;n++){
   const id=randomUUID();
   const status=n===0?'RUNNING':n===1?'QUEUED':'SUCCEEDED';
   if(n<2)activeIds.push(id);
   const job={schemaVersion:1,id,ownerId:owner.id,payload:{query:'history'},status,createdAt:new Date(now-60000+n*1000).toISOString(),heartbeatAt:new Date(now).toISOString(),startedAt:n===0?new Date(now-30000).toISOString():null};
   await tx.setting.create({data:{key:`portalImport:job:${id}`,value:JSON.stringify(job)}});
  }
  const visible=await listJobs(tx,owner.id,{now});
  assert.equal(visible.length,20);
  assert.deepEqual(new Set(visible.slice(0,2).map(job=>job.id)),new Set(activeIds));
  assert.equal(visible.filter(job=>job.status==='SUCCEEDED').length,18);
  assert.equal((await listJobs(tx,'another-owner',{now})).length,0);
  throw new Error('ROLLBACK_JOB_HISTORY');
 },{timeout:15000}),/ROLLBACK_JOB_HISTORY/);}finally{await db.$disconnect();}
});

test('job notifications match inbox tender links and provide a destination for choice or failure',async()=>{
 const id='22222222-2222-4222-8222-222222222222';
 for(const result of [{ok:true,tenderId:'saved-tender'},{ok:true,tenderId:'saved-tender',completeness:'partial',downloadWarnings:['missing reference']},{ok:true,needsChoice:true,matches:[]},{ok:false,error:'Download unavailable'}]){
  let row=JSON.stringify({id,status:'RUNNING',ownerId:'private-owner',claimToken:'worker',startedAt:new Date().toISOString()});
  let notification;
  const db={setting:{findUnique:async()=>({value:row}),updateMany:async args=>{if(args.where.value!==row)return{count:0};row=args.data.value;return{count:1};}},notification:{upsert:async args=>{notification=args.create;}}};
  await finishJob(db,id,'worker',result);
  assert.equal(notification.personId,'private-owner');
  assert.equal(notification.kind,'OFFICIAL_RETRIEVAL');
  if(result.completeness==='partial'){assert.match(notification.body,/Some attachments were unavailable/);assert.match(notification.title,/Some official tender files/);}
  assert.equal(notification.tenderId,result.needsChoice||!result.ok?null:'saved-tender');
  assert.match(notification.body,/Open Downloads for details/);
  assert.ok(!notification.body.includes('private-owner'));
 }
});

test('retained files finish as NEEDS_REVIEW with a completed Save stage and no retry',async()=>{
 const id='33333333-3333-4333-8333-333333333333';
 let row=JSON.stringify({id,status:'RUNNING',ownerId:'owner',claimToken:'worker',payload:{row:{title:'Scanned road notice'}},stage:'download',stageHistory:[{stage:'download'}],startedAt:new Date().toISOString()});
 let notification;
 const db={setting:{findUnique:async()=>({value:row}),updateMany:async args=>{if(args.where.value!==row)return{count:0};row=args.data.value;return{count:1};}},notification:{upsert:async args=>{notification=args.create;}}};
 const result=await finishJob(db,id,'worker',{ok:true,needsReview:true,completeness:'needs-review',documentCount:1,artifacts:[{id:'file-id',name:'notice.pdf',mime:'application/pdf',size:123,sha256:'a'.repeat(64),downloadUrl:'/api/desk/portal-import/artifacts/file-id',bytes:'never-store-me'}]});
 assert.equal(result.status,'NEEDS_REVIEW');assert.equal(result.canRetry,false);assert.equal(result.error,null);
 assert.equal(result.stage,'save');assert.equal(result.stageHistory.at(-1).stage,'save');
 assert.equal(result.resultJSON.artifacts.length,1);assert.ok(!JSON.stringify(result).includes('never-store-me'));
 assert.equal(notification.title,'Files saved — details need review');assert.match(notification.body,/Scanned road notice/);assert.equal(notification.tenderId,null);
});

test('normal job polling uses one owner-scoped read without writes',async()=>{
 let reads=0;
 const now=Date.now();
 const db={$queryRawUnsafe:async(sql,prefix,owner,activeOnly,limit)=>{
  reads++; assert.equal(owner,'owner');assert.equal(activeOnly,false);assert.equal(limit,20);
  return [{value:JSON.stringify({id:'active',ownerId:owner,status:'RUNNING',heartbeatAt:new Date(now).toISOString(),startedAt:new Date(now).toISOString(),payload:{}})}];
 }};
 assert.equal((await listJobs(db,'owner',{now}))[0].status,'RUNNING');assert.equal(reads,1);
});

test('enqueue and completion use a bounded timeout above the hosted database cold-start latency', async () => {
 const records=new Map(),options=[];let notifications=0;
 const tx={
  $queryRawUnsafe:async(sql,...args)=>sql.includes('pg_advisory')?[]:[...records].filter(([,value])=>{const j=JSON.parse(value);return j.ownerId===args[1]&&(!args[2]||['QUEUED','RUNNING'].includes(j.status));}).map(([key,value])=>({key,value})),
  setting:{create:async({data})=>records.set(data.key,data.value),findUnique:async({where})=>records.has(where.key)?{value:records.get(where.key)}:null,
   updateMany:async({where,data})=>{if(records.get(where.key)!==where.value)return{count:0};records.set(where.key,data.value);return{count:1};}},
  notification:{upsert:async()=>{notifications++;}},
 };
 const db={...tx,$transaction:async(work,opts)=>{options.push(opts);assert.ok(opts.timeout>5909,'Observed slow database round trips must fit');assert.ok(opts.timeout<=30000,'Database timeout must remain bounded');return work(tx);}};
 const queued=await enqueueJob(db,'owner',{link:'https://assamtenders.gov.in/nicgep/app?sp=fixture'});
 const job=await claimJob(db,queued.job.id);assert.ok(job);
 const finished=await finishJob(db,job.id,job.claimToken,{ok:false,error:'No file requested by this test'});
 assert.equal(finished.status,'FAILED');assert.equal(notifications,1);assert.equal(options.length,2);
 assert.deepEqual(options[0],{maxWait:10000,timeout:20000});
});

test('job listing reads only indexed job rows and old finished jobs are pruned in the background', async () => {
 const { pruneFinishedJobs, JOB_RETENTION_MS } = await import('../lib/desk/portal-import/jobs.mjs');
 const seen = [];
 const db = { $queryRawUnsafe: async (sql, ...args) => { seen.push(sql); return []; } };
 await listJobs(db, 'owner');
 // The query must repeat the partial index predicate as a literal so Postgres can use it.
 assert.match(seen[0], /"key" LIKE 'portalImport:job:%'/);
 assert.match(seen[0], /\(CASE WHEN "key" LIKE 'portalImport:job:%' THEN "value"::jsonb->>'ownerId' END\) = \$2/);
 const deletes = [];
 const writer = { $executeRawUnsafe: async (sql, cutoff) => { deletes.push({ sql, cutoff }); return 2; } };
 const now = Date.parse('2026-10-03T00:00:00Z');
 assert.equal(await pruneFinishedJobs(writer, now), 2);
 assert.equal(await pruneFinishedJobs(writer, now + 1000), 0, 'pruning is throttled');
 assert.match(deletes[0].sql, /IN \('SUCCEEDED','FAILED','INTERRUPTED'\)/);
 assert.doesNotMatch(deletes[0].sql, /NEEDS_REVIEW|NEEDS_INPUT/);
 assert.equal(deletes[0].cutoff, new Date(now - JOB_RETENTION_MS).toISOString());
});
