const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { PrismaClient } = require('@prisma/client');
const jwt = require('jsonwebtoken');
const { createHash, randomUUID } = require('node:crypto');
const dbUrl = process.env.DATABASE_URL || '';
if (!/^postgresql:\/\/[^@]+@(?:127\.0\.0\.1|localhost):\d+\/suchii_desk_test(?:\?|$)/.test(dbUrl)) throw new Error('Use only an isolated local suchii_desk_test database.');
const db = new PrismaClient();
const base = process.env.DESK_TEST_URL || 'http://127.0.0.1:3108';
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(base)) throw new Error('Test server must be local.');
const secret = process.env.JWT_SECRET;
const cv = (hash) => createHash('sha256').update(hash).digest('hex').slice(0,16);
const token = (e, extra = {}) => jwt.sign({ id:e.id, role:e.role, cv:cv(e.passwordHash), ...extra }, secret, { expiresIn:'1h' });
let admin, person, cookie, source;
async function request(path, body, auth = cookie, method = 'PATCH') {
 const headers = auth ? {cookie:`auth_token=${auth}`} : {};
 if (body !== undefined && !(body instanceof FormData)) headers['content-type']='application/json';
 const res = await fetch(base+path, {method, headers, body:body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body)});
 const data = (res.headers.get('content-type')||'').includes('application/json') ? await res.json() : await res.text();
 return {res,data};
}
async function tender(extra={}) { return db.tender.create({data:{sourceId:source.id,title:'Test '+randomUUID(),stage:'COMPLETED',completionDate:new Date(),bidSubmissionEnd:new Date(Date.now()+86400000),...extra}}); }
async function instrument(t, extra={}) { return db.instrument.create({data:{tenderId:t.id,category:'SD',form:'Demand draft',amount:100,status:'HELD',refundOfficeName:'Office',refundOfficeDept:'Works',refundOfficeAddress:'Street 1',refundOfficeDistrict:'District',refundOfficeState:'Assam',refundOfficerName:'Officer',...extra}}); }
async function application(t, instruments, status='DRAFT') { return db.refundApplication.create({data:{tenderId:t.id,kind:'SD',status,letterText:'Test',officeName:'Office',sentOn:status==='DRAFT'?null:new Date(),instruments:{connect:instruments.map(i=>({id:i.id}))}}}); }
before(async()=>{
 admin=await db.employee.create({data:{name:'Desk regression admin',role:'SX',status:true,passwordHash:'test-hash-'+randomUUID()}});
 cookie=token(admin);
 const check=await request('/api/desk/people',undefined,cookie,'GET'); assert.equal(check.res.status,200,JSON.stringify(check.data));
 person=await db.person.findUnique({where:{employeeId:admin.id}});
 source=await db.source.findFirst();
});
after(async()=>{await db.$disconnect();});
test('unauthenticated requests are rejected',async()=>{assert.equal((await request('/api/desk/people',undefined,null,'GET')).res.status,401);});
test('old and missing credential versions are rejected',async()=>{
 assert.equal((await request('/api/desk/people',undefined,token(admin,{cv:'old'}),'GET')).res.status,401);
 assert.equal((await request('/api/desk/people',undefined,token(admin,{cv:undefined}),'GET')).res.status,401);
});
test('demoted admins lose desk admin and money permission immediately',async()=>{
 await db.employee.update({where:{id:admin.id},data:{role:'M'}});
 assert.equal((await request('/api/desk/people',{firmName:'Forbidden'})).res.status,403);
 await db.employee.update({where:{id:admin.id},data:{role:'SX'}});
});
test('only SX can use Tender Desk; role A is refused',async()=>{
 await db.employee.update({where:{id:admin.id},data:{role:'A'}});
 assert.equal((await request('/api/desk/people',undefined,cookie,'GET')).res.status,403);
 await db.employee.update({where:{id:admin.id},data:{role:'SX'}});
});
test('inactive accounts are rejected',async()=>{
 await db.employee.update({where:{id:admin.id},data:{status:false}});
 assert.equal((await request('/api/desk/people',undefined,cookie,'GET')).res.status,401);
 await db.employee.update({where:{id:admin.id},data:{status:true}});
});
test('legacy HTML MIME is never served as HTML; malicious new upload rejected',async()=>{
 const t=await tender();const doc=await db.document.create({data:{tenderId:t.id,type:'Other',fileName:'attack.pdf',mime:'text/html',file:{create:{bytes:Buffer.from('<script>alert(1)</script>')}}}});
 const response=await fetch(base+'/api/desk/documents/'+doc.id,{headers:{cookie:`auth_token=${cookie}`}});
 assert.equal(response.headers.get('content-type'),'application/pdf');assert.equal(response.headers.get('x-content-type-options'),'nosniff');
 const form=new FormData();form.set('file',new Blob(['<script>alert(1)</script>'],{type:'text/html'}),'attack.pdf');
 assert.equal((await request(`/api/desk/tenders/${t.id}/documents`,form,cookie,'POST')).res.status,400);
});
test('valid text document and its bytes persist together',async()=>{
 const t=await tender();const form=new FormData();form.set('file',new Blob(['Tender requirements'],{type:'text/plain'}),'notice.txt');
 const result=await request(`/api/desk/tenders/${t.id}/documents`,form,cookie,'POST');assert.equal(result.res.status,200,JSON.stringify(result.data));
 const doc=await db.document.findUnique({where:{id:result.data.documents[0].id},include:{file:true}});assert.equal(Buffer.from(doc.file.bytes).toString(),'Tender requirements');
 const response=await fetch(base+'/api/desk/documents/'+doc.id,{headers:{cookie:`auth_token=${cookie}`}});assert.match(response.headers.get('content-disposition'),/^attachment/);assert.match(response.headers.get('content-security-policy'),/sandbox/);
});
test('released refunds cannot be rejected and resurrect money',async()=>{
 const t=await tender({stage:'SD_RELEASED'});const i=await instrument(t,{status:'REFUNDED'});const a=await application(t,[i],'RELEASED');
 assert.equal((await request('/api/desk/applications/'+a.id,{status:'REJECTED',rejectNote:'No'})).res.status,400);
 assert.equal((await db.instrument.findUnique({where:{id:i.id}})).status,'REFUNDED');
});
test('invalid proof leaves application and money unchanged',async()=>{
 const t=await tender({stage:'SD_APPLIED'});const i=await instrument(t,{status:'REFUND_APPLIED'});const a=await application(t,[i],'SUBMITTED');
 const form=new FormData();form.set('status','RELEASED');form.set('file',new Blob(['x'],{type:'text/html'}),'bad.html');
 assert.equal((await request('/api/desk/applications/'+a.id,form)).res.status,400);
 assert.equal((await db.instrument.findUnique({where:{id:i.id}})).status,'REFUND_APPLIED');assert.equal((await db.refundApplication.findUnique({where:{id:a.id}})).status,'SUBMITTED');
});
test('multi-office release only completes after all security money settles',async()=>{
 const t=await tender({stage:'SD_APPLIED'});const i=await instrument(t,{status:'REFUND_APPLIED'}),j=await instrument(t,{status:'REFUND_APPLIED'});
 const a=await application(t,[i],'SUBMITTED'),b=await application(t,[j],'SUBMITTED');
 assert.equal((await request('/api/desk/applications/'+a.id,{status:'RELEASED'})).res.status,200);
 assert.equal((await db.tender.findUnique({where:{id:t.id}})).stage,'SD_APPLIED');
 assert.equal((await request('/api/desk/applications/'+b.id,{status:'RELEASED'})).res.status,200);
 assert.equal((await db.tender.findUnique({where:{id:t.id}})).stage,'SD_RELEASED');
});
test('unapplied held money prevents full release',async()=>{
 const t=await tender({stage:'SD_APPLIED'});const i=await instrument(t,{status:'REFUND_APPLIED'});await instrument(t);
 const a=await application(t,[i],'SUBMITTED');assert.equal((await request('/api/desk/applications/'+a.id,{status:'RELEASED'})).res.status,200);
 assert.equal((await db.tender.findUnique({where:{id:t.id}})).stage,'COMPLETED');
});
test('changed draft instruments cannot be overwritten on submission',async()=>{
 const t=await tender();const i=await instrument(t);const a=await application(t,[i]);await db.instrument.update({where:{id:i.id},data:{status:'FORFEITED'}});
 assert.equal((await request('/api/desk/applications/'+a.id,{status:'SUBMITTED'})).res.status,409);
 assert.equal((await db.instrument.findUnique({where:{id:i.id}})).status,'FORFEITED');
});
test('direct instrument edits cannot bypass a refund application',async()=>{
 const t=await tender();const i=await instrument(t);await application(t,[i]);
 assert.equal((await request('/api/desk/instruments/'+i.id,{status:'REFUNDED'})).res.status,409);
});
test('concurrent conflicting refund changes produce one consistent result',async()=>{
 const t=await tender({stage:'SD_APPLIED'});const i=await instrument(t,{status:'REFUND_APPLIED'});const a=await application(t,[i],'SUBMITTED');
 const responses=await Promise.all([request('/api/desk/applications/'+a.id,{status:'RELEASED'}),request('/api/desk/applications/'+a.id,{status:'REJECTED',rejectNote:'Declined'})]);
 assert.equal(responses.filter(r=>r.res.status===200).length,1,JSON.stringify(responses.map(r=>r.data)));
 const saved=await db.refundApplication.findUnique({where:{id:a.id}});const money=await db.instrument.findUnique({where:{id:i.id}});
 assert.equal(money.status,saved.status==='RELEASED'?'REFUNDED':'HELD');
});
test('office addresses produce separate drafts and repeat requests return every draft',async()=>{
 const t=await tender();await db.document.create({data:{tenderId:t.id,type:'Completion certificate',fileName:'cert.txt'}});
 await instrument(t);await instrument(t,{refundOfficeAddress:'Street 2'});
 const url=`/api/desk/tenders/${t.id}/applications`;
 const first=await request(url,{kind:'SD'},cookie,'POST');assert.equal(first.res.status,200,JSON.stringify(first.data));assert.equal(first.data.applicationIds.length,2);
 const second=await request(url,{kind:'SD'},cookie,'POST');assert.deepEqual(second.data.applicationIds.sort(),first.data.applicationIds.sort());
});
test('concurrent drafting cannot duplicate or steal instruments',async()=>{
 const t=await tender();await db.document.create({data:{tenderId:t.id,type:'Completion certificate',fileName:'cert.txt'}});await instrument(t);
 const url=`/api/desk/tenders/${t.id}/applications`;const results=await Promise.all([request(url,{kind:'SD'},cookie,'POST'),request(url,{kind:'SD'},cookie,'POST')]);
 assert.ok(results.every(r=>[200,409].includes(r.res.status)),JSON.stringify(results.map(r=>r.data)));
 assert.equal(await db.refundApplication.count({where:{tenderId:t.id}}),1);
});
test('summary refresh preserves ticked lines and releases lease',async()=>{
 const t=await tender();const item=await db.checklistItem.create({data:{tenderId:t.id,label:'Previous requirement',section:'technical',fromSummary:true,mandatory:true,ticks:{create:{personId:person.id}}}});
 const result=await request(`/api/desk/tenders/${t.id}/summary`,{},cookie,'POST');assert.equal(result.res.status,200,JSON.stringify(result.data));
 assert.equal(await db.checklistTick.count({where:{itemId:item.id}}),1);assert.equal((await db.tender.findUnique({where:{id:t.id}})).summaryBusy,false);
});
test('active summary leases reject duplicate work; stale leases recover',async()=>{
 const t=await tender({summaryBusy:true,summaryRunId:'active',summaryStartedAt:new Date()});
 assert.equal((await request(`/api/desk/tenders/${t.id}/summary`,{},cookie,'POST')).res.status,409);
 await db.tender.update({where:{id:t.id},data:{summaryStartedAt:new Date(Date.now()-11*60000)}});
 assert.equal((await request(`/api/desk/tenders/${t.id}/summary`,{},cookie,'POST')).res.status,200);
});
test('invalid money and calendar dates rejected',async()=>{
 const t=await tender();const i=await instrument(t);
 assert.equal((await request('/api/desk/instruments/'+i.id,{amount:'Infinity'})).res.status,400);
 assert.equal((await request('/api/desk/instruments/'+i.id,{instrumentDate:'2026-02-31'})).res.status,400);
});
test('cron rejects absent and wrong secrets',async()=>{
 assert.equal((await fetch(base+'/api/desk/tick')).status,401);
 assert.equal((await fetch(base+'/api/desk/tick',{headers:{authorization:'Bearer wrong'}})).status,401);
});

test('simultaneous first visits create a single desk identity',async()=>{
 const e=await db.employee.create({data:{name:'First visit test',role:'SX',status:true,passwordHash:'new-user-hash'}});
 const auth=token(e);
 const results=await Promise.all(Array.from({length:5},()=>request('/api/desk/people',undefined,auth,'GET')));
 assert.ok(results.every(r=>r.res.status===200),JSON.stringify(results.map(r=>r.data)));
 assert.equal(await db.person.count({where:{employeeId:e.id}}),1);
});

test('cancelled drafts unlock instruments and retain their history',async()=>{
 const t=await tender();const i=await instrument(t);const a=await application(t,[i]);
 assert.equal((await request('/api/desk/applications/'+a.id,{status:'REJECTED',rejectNote:'Correct office details'})).res.status,200);
 const saved=await db.refundApplication.findUnique({where:{id:a.id}});
 assert.equal(JSON.parse(saved.instrumentsSnapshot)[0].id,i.id);
 assert.equal((await db.instrument.findUnique({where:{id:i.id}})).applicationId,null);
 assert.equal((await request('/api/desk/instruments/'+i.id,{number:'Corrected'})).res.status,200);
});
test('rejected submitted applications unlock instruments for renewal',async()=>{
 const t=await tender({stage:'SD_APPLIED'});const i=await instrument(t,{status:'REFUND_APPLIED'});const a=await application(t,[i],'SUBMITTED');
 assert.equal((await request('/api/desk/applications/'+a.id,{status:'REJECTED',rejectNote:'Need revised paperwork'})).res.status,200);
 assert.equal((await db.instrument.findUnique({where:{id:i.id}})).applicationId,null);
 assert.equal((await request('/api/desk/instruments/'+i.id,{number:'Renewed'})).res.status,200);
});
test('failed instrument proof upload leaves no money record',async()=>{
 const t=await tender();const form=new FormData();form.set('category','EMD');form.set('form','Demand draft');form.set('amount','120');form.set('status','HELD');form.set('proof',new Blob(['bad'],{type:'text/html'}),'bad.html');
 assert.equal((await request(`/api/desk/tenders/${t.id}/instruments`,form,cookie,'POST')).res.status,400);
 assert.equal(await db.instrument.count({where:{tenderId:t.id}}),0);
});

test('cancelling an old draft never resurrects already refunded money',async()=>{
 const t=await tender();const i=await instrument(t,{status:'REFUNDED'});const a=await application(t,[i]);
 assert.equal((await request('/api/desk/applications/'+a.id,{status:'REJECTED',rejectNote:'Obsolete draft'})).res.status,200);
 const saved=await db.instrument.findUnique({where:{id:i.id}});assert.equal(saved.status,'REFUNDED');assert.equal(saved.applicationId,null);
});

test('negative award amount is rejected without changing tender or evidence',async()=>{
 const t=await tender({stage:'BID_SUBMITTED'});
 const form=new FormData();form.set('stage','GOT_THE_BID');form.set('awardDate','2026-09-30');form.set('awardedValue','-1');
 form.set('file',new Blob(['Synthetic award'],{type:'text/plain'}),'award.txt');
 const result=await request(`/api/desk/tenders/${t.id}/stage`,form,cookie,'POST');assert.equal(result.res.status,400);
 assert.equal((await db.tender.findUnique({where:{id:t.id}})).stage,'BID_SUBMITTED');
 assert.equal(await db.document.count({where:{tenderId:t.id}}),0);
});

test('selected tender completes award, separate EMD/SD, completion and security refund lifecycle', async () => {
 const t=await tender({stage:'UPLOADED',completionDate:null,summaryJson:JSON.stringify({summary:'Local lifecycle fixture'})});
 const root=`/api/desk/tenders/${t.id}`;
 const post=async(path,body)=>{const r=await request(path,body,cookie,'POST');assert.equal(r.res.status,200,JSON.stringify(r.data));return r.data;};
 await post(root+'/select',{});
 assert.equal((await db.selection.findUnique({where:{tenderId_personId:{tenderId:t.id,personId:person.id}}})).frequency,'FREQUENT');
 assert.equal((await db.tender.findUnique({where:{id:t.id}})).stage,'SELECTED');
 const office={refundOfficeName:'Lifecycle office',refundOfficeDept:'Works',refundOfficeAddress:'Street',refundOfficeDistrict:'District',refundOfficeState:'Assam',refundOfficerName:'Officer'};
 const money={form:'Demand draft',amount:100,status:'HELD',...office};
 assert.equal((await request(root+'/instruments',{category:'SD',...money},cookie,'POST')).res.status,400);
 const emd=await post(root+'/instruments',{category:'EMD',...money});
 await post(root+'/stage',{stage:'PREPARING_BID'});
 await post(root+'/stage',{stage:'BID_SUBMITTED'});
 assert.equal((await request(root+'/stage',{stage:'GOT_THE_BID',awardDate:'2026-01-01',awardedValue:10000},cookie,'POST')).res.status,400);
 const award=new FormData();award.set('stage','GOT_THE_BID');award.set('awardDate','2026-01-01');award.set('awardedValue','10000');award.set('file',new Blob(['Award issued for lifecycle test'],{type:'text/plain'}),'award.txt');
 await post(root+'/stage',award);
 const sd=await post(root+'/instruments',{category:'SD',...money,amount:200});
 await post(root+'/stage',{stage:'IN_EXECUTION'});
 assert.equal((await request(root+'/applications',{kind:'SD'},cookie,'POST')).res.status,400);
 assert.equal((await request(root+'/completion',{completionDate:'2026-01-02',sdReleaseEligibleAt:'2026-01-03'},cookie,'POST')).res.status,400);
 const complete=new FormData();complete.set('completionDate','2026-01-02');complete.set('sdReleaseEligibleAt','2026-01-03');complete.set('certNo','LOCAL-TEST');complete.set('authority','Works office');complete.set('file',new Blob(['Completion certificate for local test'],{type:'text/plain'}),'completion.txt');
 await post(root+'/completion',complete);
 const drafted=await post(root+'/applications',{kind:'SD'});assert.equal(drafted.applicationIds.length,1);
 assert.equal(await db.activity.count({where:{tenderId:t.id,action:'security money drafted'}}),1);
 const appId=drafted.applicationIds[0];
 const draft=await db.refundApplication.findUnique({where:{id:appId},include:{instruments:true}});
 assert.equal(draft.officeName,office.refundOfficeName);assert.deepEqual(draft.instruments.map(i=>i.id),[sd.instrumentId]);
 assert.equal((await db.instrument.findUnique({where:{id:emd.instrumentId}})).status,'HELD');
 for(const status of ['SUBMITTED','ACKNOWLEDGED','RELEASED']) {
  const r=await request('/api/desk/applications/'+appId,{status});assert.equal(r.res.status,200,JSON.stringify(r.data));
 }
 const final=await db.tender.findUnique({where:{id:t.id},include:{documents:{include:{file:true}},instruments:true}});
 assert.equal(final.stage,'SD_RELEASED');assert.equal(final.completionCertNo,'LOCAL-TEST');
 assert.ok(final.documents.find(d=>d.type==='Completion certificate').file.bytes.length>0);
 assert.equal(final.instruments.find(i=>i.id===sd.instrumentId).status,'REFUNDED');
 assert.equal(final.instruments.find(i=>i.id===emd.instrumentId).status,'HELD');
 assert.equal((await request(root+'/stage',{stage:'CLOSED'},cookie,'POST')).res.status,400,'Held EMD still prevents closing');
});
