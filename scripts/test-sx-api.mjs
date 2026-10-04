/** Real HTTP regression against disposable local database only. */
import assert from 'node:assert/strict';
import {PrismaClient} from '@prisma/client';
import bcrypt from 'bcryptjs';
import {randomUUID} from 'node:crypto';
const url=process.env.DATABASE_URL||'',base=process.env.SX_TEST_URL||'http://localhost:3221';
if(!/^postgresql:\/\/[^@]+@(?:127\.0\.0\.1|localhost):\d+\/suchii_desk_test(?:\?|$)/.test(url)||!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(base))throw Error('Use isolated local suchii_desk_test database and local server');
const db=new PrismaClient(),tag=randomUUID(),password=randomUUID();let employees=[],people=[],tender,source,attendance,leave,department;let checks=0;
async function call(path,cookie,body,method=body?'POST':'GET') {const r=await fetch(base+path,{method,headers:{...(cookie?{cookie}:{}),...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});return {status:r.status,body:await r.json()};}
async function login(e){const r=await fetch(base+'/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:e.email,password})});assert.equal(r.status,200);checks++;return r.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');}
function hidden(data,sx,person){const text=JSON.stringify(data);assert.ok(!text.includes(sx.id));assert.ok(!text.includes(sx.name));if(person)assert.ok(!text.includes(person.id));checks++;}
try {
 department=await db.department.create({data:{name:'SX API QA '+tag}});
 const passwordHash=await bcrypt.hash(password,10);
 for(const role of ['A','SX','E'])employees.push(await db.employee.create({data:{name:`SX-QA-${role}-${tag}`,email:`${role.toLowerCase()}-${tag}@example.invalid`,role,passwordHash,status:true,deptId:department.id}}));
 const [admin,sx,staff]=employees;
 for(const e of [admin,sx])people.push(await db.person.create({data:{employeeId:e.id,name:e.name,roles:'ADMIN,TENDER_EXECUTIVE,BIDDER,ACCOUNTS',passwordHash:'console'}}));
 const [adminPerson,sxPerson]=people;
 await db.department.update({where:{id:department.id},data:{HOD:sx.id}});
 attendance=await db.attendance.create({data:{employeeId:sx.id}});leave=await db.leave.create({data:{employeeId:sx.id}});
 source=await db.source.create({data:{id:'sx-qa-'+tag,displayName:'SX QA',officialName:'QA',url:'https://example.invalid',kind:'NOTICE',order:9999,mark:'NONE',intakeRule:'QA',isDaily:false}});
 tender=await db.tender.create({data:{sourceId:source.id,title:'SX backend privacy QA '+tag,bidSubmissionEnd:new Date(Date.now()+86400000),createdById:sxPerson.id,activities:{create:{personId:sxPerson.id,action:'selected',detail:sx.name+' selected this tender'}},selections:{create:{personId:sxPerson.id,frequency:'OFF'}}}});
 const adminCookie=await login(admin),sxCookie=await login(sx);
 for(const q of ['?limit=100','?role=SX','?search='+encodeURIComponent(sx.email)]){const r=await call('/api/employees'+q,adminCookie);assert.equal(r.status,200);hidden(r.body,sx);}
 assert.equal((await call('/api/employees/'+sx.id,adminCookie)).status,404);checks++;
 assert.equal((await call('/api/employees/'+sx.id,sxCookie)).status,200);checks++;
 for(const path of ['/api/attendance/'+attendance.id,'/api/leaves/'+leave.id]){assert.equal((await call(path,adminCookie)).status,404);checks++;}
 const dept=await call('/api/departments/'+department.id,adminCookie);assert.equal(dept.status,200);hidden(dept.body,sx);
 const directory=await call('/api/desk/people',adminCookie);assert.equal(directory.status,200);hidden(directory.body,sx,sxPerson);
 const assign=await call('/api/desk/assignments',adminCookie,{personId:sxPerson.id,fromDate:'2026-10-01',toDate:'2026-10-02'});assert.equal(assign.status,400);checks++;
 const detail=await call('/api/desk/tenders/'+tender.id,adminCookie);assert.equal(detail.status,200);hidden(detail.body,sx,sxPerson);
 assert.equal((await db.activity.count({where:{tenderId:tender.id,personId:sxPerson.id}})),1);checks++;
 assert.equal((await db.employee.findUnique({where:{id:sx.id}})).role,'SX');checks++;
 console.log(JSON.stringify({ok:true,checks,scope:'SX login/private profile preserved; directory/direct reads/assignments/actors hidden; audit storage intact'}));
} finally {
 if(tender)await db.tender.delete({where:{id:tender.id}});if(source)await db.source.delete({where:{id:source.id}});
 if(attendance)await db.attendance.delete({where:{id:attendance.id}});if(leave)await db.leave.delete({where:{id:leave.id}});
 for(const p of people){await db.notification.deleteMany({where:{personId:p.id}});await db.activity.deleteMany({where:{personId:p.id}});await db.person.delete({where:{id:p.id}});}
 for(const e of employees)await db.employee.delete({where:{id:e.id}});if(department)await db.department.delete({where:{id:department.id}});await db.$disconnect();
}
