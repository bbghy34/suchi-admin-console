import test from 'node:test';
import assert from 'node:assert/strict';
import { workforceEmployeeWhere, workforceRecordWhere, workforceRecordDelegate, publicSite } from '../lib/luit-admin/privacy.mjs';

test('workforce filter keeps unique id and existing AND without losing hidden-role exclusion',()=>{
 const where=workforceEmployeeWhere({id:'x',AND:{status:true}});
 assert.equal(where.id,'x'); assert.deepEqual(where.AND[0],{status:true});
 assert.deepEqual(where.AND[1],{OR:[{role:null},{role:{not:'SX'}}]});
});
test('hidden site manager is removed without changing business data or audit history',()=>{
 const site={id:'site',sitManager:'hidden',manager:{id:'hidden',role:'SX',name:'Hidden'},createdBy:'audit'};
 assert.deepEqual(publicSite(site),{...site,sitManager:null,manager:null});
 assert.equal(site.manager.name,'Hidden');
 assert.deepEqual(publicSite({manager:{id:'regular',role:'M',name:'Manager'}}),{manager:{id:'regular',name:'Manager'}});
});
test('activation delegate scopes reads and writes to visible workforce records',async()=>{
 const calls=[];const delegate=workforceRecordDelegate({findUnique:async a=>calls.push(a),update:async a=>calls.push(a)});
 await delegate.findUnique({where:{id:'attendance'}}); await delegate.update({where:{id:'attendance'},data:{isActive:false}});
 for(const call of calls)assert.deepEqual(call.where,{id:'attendance',...workforceRecordWhere()});
});

test('Postgres enforces workforce filters on direct reads and nested counts', {skip:!process.env.WORKFORCE_TEST_DATABASE_URL}, async()=>{
 const {PrismaClient}=await import('@prisma/client');const db=new PrismaClient({datasourceUrl:process.env.WORKFORCE_TEST_DATABASE_URL});
 try {await assert.rejects(db.$transaction(async tx=>{
  const dept=await tx.department.create({data:{name:'SX isolation test'}});
  const hidden=await tx.employee.create({data:{name:'Hidden test',role:'SX',deptId:dept.id}});
  await tx.employee.create({data:{name:'Visible test',role:'E',deptId:dept.id}});
  const att=await tx.attendance.create({data:{employeeId:hidden.id}});
  const leave=await tx.leave.create({data:{employeeId:hidden.id}});
  assert.ok(await tx.employee.findUnique({where:{id:hidden.id}}),'auth lookup preserved');
  assert.equal(await tx.employee.findUnique({where:workforceEmployeeWhere({id:hidden.id})}),null);
  assert.equal(await tx.attendance.findUnique({where:{id:att.id,...workforceRecordWhere()}}),null);
  assert.equal(await tx.leave.findUnique({where:{id:leave.id,...workforceRecordWhere()}}),null);
  const row=await tx.department.findUnique({where:{id:dept.id},include:{_count:{select:{employees:{where:workforceEmployeeWhere()}}}}});
  assert.equal(row._count.employees,1);
  throw new Error('ROLLBACK_TEST_FIXTURES');
 }),/ROLLBACK_TEST_FIXTURES/);}finally{await db.$disconnect();}
});
