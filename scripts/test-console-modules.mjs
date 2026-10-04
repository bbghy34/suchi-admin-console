/** Local-only integration audit. Uses an isolated schema and never logs credentials or response records. */
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
import { createHash, randomUUID } from 'node:crypto';
const url=new URL(process.env.DATABASE_URL);
const disposableLocal = ['127.0.0.1','localhost'].includes(url.hostname) && url.pathname === '/suchii_desk_test';
if (!disposableLocal) {
 assert.equal(url.searchParams.get('schema'),'codex_portal_validation');
 assert.match(url.searchParams.get('options')||'',/search_path=codex_portal_validation/);
}
const base=process.env.CONSOLE_TEST_URL || 'http://127.0.0.1:3217';
assert.match(base,/^http:\/\/(localhost|127\.0\.0\.1):\d+$/);
const db=new PrismaClient();const results=[];
const output=process.argv[2] || 'tools/assam-tenders/verification/console-modules.json';
const actors={}; const actorIds={};
async function record(name,path,{role='A',method='GET',body,status=200,check}={}) {
 const started=Date.now();
 try {
  const response=await fetch(base+path,{method,headers:{Authorization:`Bearer ${actors[role]}`,cookie:`auth_token=${actors[role]}`,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(30000)});
  const data=await response.json();
  assert.equal(response.status,status,data.message || data.error);
  if(status<300) assert(data.success===true || data.ok===true, 'Missing success flag');
  if(check) await check(data);
  results.push({name,path,status:response.status,passed:true,ms:Date.now()-started});return data;
 } catch(e) {results.push({name,path,passed:false,error:e.message,ms:Date.now()-started});return null;}
}
try {
 for(const role of ['A','AA','M','E']) {
  const name=`Console QA ${role}`;
  let e=await db.employee.findFirst({where:{name}});
  if(!e) e=await db.employee.create({data:{name,role,status:true,passwordHash:'qa-only-'+randomUUID()}});
  actorIds[role]=e.id;
  actors[role]=jwt.sign({id:e.id,role,cv:createHash('sha256').update(e.passwordHash).digest('hex').slice(0,16)},process.env.JWT_SECRET,{expiresIn:'1h'});
 }
 const reads=['dashboard','projects','sites','boqs','employees','departments','designations','attendance','leaves','firms','contractors','progress','site-expenses',
 'warehouse/summary','warehouse/materials','warehouse/categories','warehouse/units','warehouse/suppliers','warehouse/stock','warehouse/ledger','warehouse/inward','warehouse/outward','warehouse/requests','warehouse/adjustments','warehouse/low-stock','warehouse/options',
 'desk/people','desk/notifications','desk/portal-import'];
 for(const path of reads) await record(path,'/api/'+path);
 for(const type of ['attendance','projects','contractors','employees','leaves']) await record('Report '+type,'/api/reports?reportType='+type);
 for(const type of ['stock','inward','outward','consumption','valuation']) await record('Warehouse report '+type,'/api/warehouse/reports?type='+type);
 for(const path of ['parties','boq-bills','project-payments','bills/summary']) await record('Accounts '+path,'/api/'+path,{role:'AA'});
 for(const [role,path,status] of [['E','/api/warehouse/stock',403],['E','/api/employees',403],['M','/api/departments',200],['E','/api/attendance',200],['E','/api/leaves',200],['A','/api/parties',403]]) await record('Role boundary '+role+' '+path,path,{role,status});
 await record('Manager cannot create department','/api/departments',{role:'M',method:'POST',body:{name:'Must not be created'},status:403});
 // Test input validation without storing invalid records.
 for(const path of ['parties','boqs','projects','sites','site-expenses']) await record('Invalid input '+path,'/api/'+path,{role:path==='parties'?'AA':'A',method:'POST',body:{},status:400});

 // Connected workflows with clearly labelled synthetic fixtures, retained only in the validation schema.
 const tag='QA-'+Date.now();
 const create=async(path,body,role='A')=>{
  const result=await record('Create '+path,'/api/'+path,{method:'POST',body,role,status:201});
  assert(result?.data, 'Workflow prerequisite failed: '+path);return result.data;
 };
 const department=await create('departments',{name:tag+' Department'});
 const firm=await create('firms',{name:tag+' Firm'});
 const contractor=await create('contractors',{name:tag+' Contractor',phoneNo:'9000000000'});
 const project=await create('projects',{name:tag+' Project',department:department.id,firmId:firm.id,contractor:contractor.id,startDate:'2026-09-01',endDate:'2026-12-31',budget:100000,status:'Ongoing'});
 const site=await create('sites',{name:tag+' Site',projectId:project.id,coordinates:'26.1445,91.7362',attendanceRadius:200,sitManager:actorIds.M});
 const boq=await create('boqs',{boqCode:tag,projectId:project.id,siteId:site.id});
 await create('boq-items',{boqId:boq.id,slNo:'1',itemName:'QA concrete',quantity:'10',unit:'m3',rate:100,amount:1000});
 const items=await record('Read linked BOQ items','/api/boq-items?boqId='+boq.id,{check:d=>{assert.equal(d.data.length,1);assert.equal(d.data[0].boqId,boq.id);}});
 const item=items.data[0];
 await record('Mixed BOQ batch is rejected atomically','/api/boq-items',{method:'POST',body:[{boqId:boq.id,itemName:'Must not save'},{itemName:'Missing parent'}],status:400});
 await record('Invalid BOQ amount rejected','/api/boq-items',{method:'POST',body:{boqId:boq.id,rate:'invalid'},status:400});
 await record('Failed batch added no lines','/api/boq-items?boqId='+boq.id,{check:d=>assert.equal(d.data.length,1)});
 await record('BOQ delivery photo list','/api/boq-items/'+item.id+'/images');
 const party=await create('parties',{name:tag+' Party',phoneNo:'9000000001'},'AA');
 await record('Party duplicate blocked','/api/parties',{role:'AA',method:'POST',body:{name:tag+' Party',phoneNo:'9000000001'},status:409});
 await create('boq-bills',{projectId:project.id,partyId:party.id,billDate:'2026-09-30',billNo:tag,billAmount:'1000',billPayment:'400',billPaymentDate:'2026-09-30'},'AA');
 await record('Project bill summary reconciles','/api/bills/summary?projectId='+project.id,{role:'AA',check:d=>{assert.equal(Number(d.data.boqPaid),400);assert.equal(Number(d.data.boqBilled),1000);}});
 await create('site-expenses',{siteId:site.id,itemName:tag+' Fuel',price:'100',remarks:'Synthetic QA record'});
 await record('Site expense relation','/api/site-expenses?siteId='+site.id,{check:d=>assert(d.data.some(r=>r.itemName===tag+' Fuel' && r.site.id===site.id))});
 const leave=await create('leaves',{reason:tag+' request',leaveDate:'2026-10-10',duration:1},'E');
 await record('Approve employee leave','/api/leaves/'+leave.id,{method:'PUT',body:{approved:true}});
 await record('Employee sees approval','/api/leaves/'+leave.id,{role:'E',check:d=>assert.equal(d.data.approved,true)});
 await create('attendance',{employeeId:actorIds.E,siteId:site.id,method:'GPS',checkInLat:26.1445,checkInLng:91.7362,gpsAccuracy:5},'E');
 await record('Phone-style checkout','/api/attendance',{role:'E',method:'POST',body:{employeeId:actorIds.E,siteId:site.id,action:'checkout'}});
 await record('Employee cannot mark another employee','/api/attendance',{role:'E',method:'POST',body:{employeeId:actorIds.M,siteId:site.id},status:403});
 // Fixed, finished shifts make pagination totals deterministic.
 await db.attendance.createMany({data:[1,2,3].map(hours=>({employeeId:actorIds.E,siteId:site.id,checkInTime:new Date('2026-09-25T06:00:00Z'),checkOutTime:new Date(Date.parse('2026-09-25T06:00:00Z')+hours*3600000),method:tag}))});
 const first=await record('Attendance summary page one','/api/attendance?search='+tag+'&limit=1&page=1');
 await record('Attendance summary independent of pagination','/api/attendance?search='+tag+'&limit=1&page=2',{check:d=>{assert.equal(d.pagination.summary.totalMinutes,360);assert.deepEqual(d.pagination.summary,first.pagination.summary);}});
 const category=await create('warehouse/categories',{name:tag+' Category'});
 const unit=await create('warehouse/units',{name:tag+' Units',symbol:tag});
 const supplier=await create('warehouse/suppliers',{name:tag+' Supplier'});
 const material=await create('warehouse/materials',{name:tag+' Material',code:tag,categoryId:category.id,unitId:unit.id,minStock:2});
 await create('warehouse/inward',{materialId:material.id,supplierId:supplier.id,quantity:10,rate:20});
 const request=await create('warehouse/requests',{materialId:material.id,projectId:project.id,siteId:site.id,quantity:3},'M');
 await record('Approve material request','/api/warehouse/requests/'+request.id,{method:'PATCH',body:{action:'APPROVE'}});
 await record('Issue material request','/api/warehouse/requests/'+request.id,{method:'PATCH',body:{action:'ISSUE'}});
 await record('Prevent duplicate issue','/api/warehouse/requests/'+request.id,{method:'PATCH',body:{action:'ISSUE'},status:400});
 await record('Stock quantity reconciles','/api/warehouse/stock',{check:d=>{const row=d.data.find(r=>r.id===material.id || r.materialId===material.id);assert(row);assert.equal(Number(row.quantity),7);}});
 await record('Prevent negative stock','/api/warehouse/outward',{method:'POST',body:{materialId:material.id,quantity:100,projectId:project.id,siteId:site.id},status:400});

} catch(error) { results.push({name:"Workflow prerequisites",passed:false,error:error.message}); } finally {
 await db.$disconnect();mkdirSync('tools/assam-tenders/verification',{recursive:true});writeFileSync(output,JSON.stringify(results,null,2));
 console.log(JSON.stringify({checks:results.length,passed:results.filter(r=>r.passed).length,failed:results.filter(r=>!r.passed)},null,2));
 if(results.some(r=>!r.passed)) process.exitCode=1;
}
