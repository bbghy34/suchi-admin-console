/** Real HTTP background-job verification. Only disposable local DBs are accepted. */
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
const databaseUrl = process.env.DATABASE_URL || '';
const base = process.env.IMPORT_JOBS_TEST_URL || 'http://localhost:3221';
if (!/^postgresql:\/\/[^@]+@(?:127\.0\.0\.1|localhost):\d+\/suchii_desk_test(?:\?|$)/.test(databaseUrl) || !/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(base)) throw new Error('Use disposable local suchii_desk_test and a local server.');
const db = new PrismaClient(), tag = randomUUID(), password = randomUUID();
const employees = [], people = [], jobs = new Set();
let tender, createdSource = false, checks = 0;
const endpoint = '/api/desk/portal-import/jobs';
const sleep = ms => new Promise(resolve => setTimeout(resolve,ms));
async function call(path,cookie,body,method=body?'POST':'GET') {
  const response = await fetch(base+path,{method,headers:{...(cookie?{cookie}:{}),...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(15000)});
  return {status:response.status,body:await response.json()};
}
async function login(employee) {
  const response=await fetch(base+'/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:employee.email,password})});
  assert.equal(response.status,200);checks++;
  return response.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');
}
function safeJob(job) {
  for (const key of ['ownerId','payload','claimToken','dedupeKey']) assert.equal(Object.hasOwn(job,key),false);
  assert.ok(job.id);assert.ok(job.status);checks++;
}
async function queue(cookie,input) {
  const response=await call(endpoint,cookie,input);
  assert.equal(response.status,202,JSON.stringify(response.body));
  safeJob(response.body.job);jobs.add(response.body.job.id);checks++;
  return response.body.job;
}
async function terminal(cookie,id) {
  const deadline=Date.now()+15000;
  while(Date.now()<deadline){
    const response=await call(`${endpoint}/${id}`,cookie);
    assert.equal(response.status,200,JSON.stringify(response.body));safeJob(response.body.job);
    if(!['QUEUED','RUNNING'].includes(response.body.job.status))return response.body.job;
    await sleep(150);
  }
  throw new Error('Background job did not complete within 15 seconds: '+id);
}
async function oneNotification(personId,jobId) {
  assert.equal(await db.notification.count({where:{personId,dedupeKey:`portal-job:${jobId}:terminal`}}),1);checks++;
}
try {
  const passwordHash=await bcrypt.hash(password,10);
  for(const role of ['A','A','E','SX']){
    const employee=await db.employee.create({data:{name:`Job-API-QA-${role}-${tag}-${employees.length}`,email:`job-${employees.length}-${tag}@example.invalid`,role,status:true,passwordHash}});employees.push(employee);
    const person=await db.person.create({data:{employeeId:employee.id,name:employee.name,roles:role==='E'?'BIDDER':'ADMIN,TENDER_EXECUTIVE,BIDDER,ACCOUNTS'}});people.push(person);
  }
  if(!await db.source.findUnique({where:{id:'gem'}})){
    await db.source.create({data:{id:'gem',displayName:'GeM',officialName:'GeM test source',url:'https://bidplus.gem.gov.in/',order:9999,mark:'NONE',intakeRule:'QA',isDaily:false}});createdSource=true;
  }
  // Existing official identity is found before any government request or CAPTCHA.
  const noticeId=String(Date.now()).slice(-12),link=`https://bidplus.gem.gov.in/showbidDocument/${noticeId}`;
  tender=await db.tender.create({data:{sourceId:'gem',sourceUrl:link,portalTenderId:`GEM/2026/B/${noticeId}`,title:'Existing background-job QA '+tag,bidSubmissionEnd:new Date(Date.now()+86400000),documents:{create:{type:'NIT',fileName:'cached-test.pdf',mime:'application/pdf',size:9,textStatus:'TEXT',file:{create:{bytes:Buffer.from('%PDF-test')}}}}}});
  const [ownerCookie,otherCookie,staffCookie,sxCookie]=await Promise.all(employees.map(login));
  assert.equal((await call(endpoint)).status,401);checks++;
  const input={link,query:'existing fixture'};
  const queued=await queue(ownerCookie,input);
  const success=await terminal(ownerCookie,queued.id);
  assert.equal(success.status,'SUCCEEDED');assert.equal(success.resultJSON.tenderId,tender.id);assert.equal(success.resultJSON.existing,true);checks++;
  const persisted=JSON.parse((await db.setting.findUnique({where:{key:`portalImport:job:${queued.id}`}})).value);
  assert.equal(persisted.status,'SUCCEEDED');assert.equal(persisted.attempt,1);checks++;
  await oneNotification(people[0].id,queued.id);
  const list=await call(endpoint,ownerCookie);assert.equal(list.status,200);assert.ok(list.body.jobs.some(j=>j.id===queued.id));list.body.jobs.forEach(safeJob);checks++;
  const otherList=await call(endpoint,otherCookie);assert.equal(otherList.status,200);assert.ok(!otherList.body.jobs.some(j=>j.id===queued.id));checks++;
  assert.equal((await call(`${endpoint}/${queued.id}`,otherCookie)).status,404);checks++;
  assert.equal((await call(`${endpoint}/${queued.id}/retry`,otherCookie,{})).status,404);checks++;
  assert.equal((await call(`${endpoint}/${queued.id}/retry`,ownerCookie,{})).status,409);checks++;
  assert.ok([401,403].includes((await call(endpoint,staffCookie,input)).status));checks++;
  assert.ok([401,403].includes((await call(`${endpoint}/${queued.id}/retry`,staffCookie,{})).status));checks++;
  // Unsupported URL is rejected during identity validation, before network retrieval.
  const bad=await queue(ownerCookie,{link:'https://example.invalid/not-an-official-portal',query:'invalid fixture'});
  const failed=await terminal(ownerCookie,bad.id);assert.equal(failed.status,'FAILED');assert.equal(failed.canRetry,true);assert.ok(failed.error);checks++;
  await oneNotification(people[0].id,bad.id);
  const retry=await call(`${endpoint}/${bad.id}/retry`,ownerCookie,{});assert.equal(retry.status,202);jobs.add(retry.body.job.id);assert.notEqual(retry.body.job.id,bad.id);checks++;
  assert.equal((await terminal(ownerCookie,retry.body.job.id)).status,'FAILED');await oneNotification(people[0].id,retry.body.job.id);
  const privateJob=await queue(sxCookie,input);assert.equal((await terminal(sxCookie,privateJob.id)).status,'SUCCEEDED');await oneNotification(people[3].id,privateJob.id);
  assert.equal((await call(`${endpoint}/${privateJob.id}`,ownerCookie)).status,404);checks++;
  // Repeated reads must not replay work or issue duplicate completion notifications.
  await call(`${endpoint}/${queued.id}`,ownerCookie);await call(endpoint,ownerCookie);await oneNotification(people[0].id,queued.id);
  console.log(JSON.stringify({ok:true,checks,jobs:jobs.size,governmentRequests:0,scope:'202 enqueue; persisted completion; own status/list; owner isolation; notification once; explicit retry; permission guards; SX private inbox'}));
} finally {
  // Give any already-dispatched local fixture worker time to finish before teardown.
  for(let attempt=0;attempt<50;attempt++){
    const records=await db.setting.findMany({where:{key:{in:[...jobs].map(id=>`portalImport:job:${id}`)}}});
    if(!records.some(r=>['QUEUED','RUNNING'].includes(JSON.parse(r.value).status)))break;
    await sleep(100);
  }
  await db.setting.deleteMany({where:{key:{in:[...jobs].map(id=>`portalImport:job:${id}`)}}});
  for(const person of people)await db.notification.deleteMany({where:{personId:person.id}});
  if(tender)await db.tender.delete({where:{id:tender.id}});
  if(createdSource)await db.source.delete({where:{id:'gem'}});
  for(const person of people)await db.person.delete({where:{id:person.id}});
  for(const employee of employees)await db.employee.delete({where:{id:employee.id}});
  await db.$disconnect();
}
