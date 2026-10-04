// Local-only profile regression. Creates and removes one synthetic employee.
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
import { createHash, randomUUID } from 'node:crypto';
const database = new URL(process.env.DATABASE_URL);
assert.ok(['localhost','127.0.0.1'].includes(database.hostname) && database.pathname === '/suchii_desk_test', 'Requires disposable local database');
const base = process.env.CONSOLE_TEST_URL || 'http://127.0.0.1:3224';
assert.match(base, /^http:\/\/(localhost|127\.0\.0\.1):\d+$/);
const db = new PrismaClient();
let employee;
try {
 employee = await db.employee.create({data:{name:'Profile QA '+randomUUID(),role:'E',status:true,passwordHash:'qa-only-'+randomUUID()}});
 const token = jwt.sign({id:employee.id,role:'E',cv:createHash('sha256').update(employee.passwordHash).digest('hex').slice(0,16)},process.env.JWT_SECRET,{expiresIn:'5m'});
 const request = async (path, method='GET', body) => {
  const response = await fetch(base+path,{method,headers:{cookie:`auth_token=${token}`,'Content-Type':'application/json'},body:body ? JSON.stringify(body) : undefined,signal:AbortSignal.timeout(15000)});
  return {status:response.status,json:await response.json()};
 };
 const path='/api/employees/'+employee.id;
 const before=await request(path); assert.equal(before.status,200); assert.equal(before.json.data.passwordHash,undefined);
 const updated=await request(path,'PUT',{phone:'9876543210',emergencyNo:'9876543211',address:'Synthetic profile test',bankDetails:{bankName:'Test bank',accountNumber:'00123',ifscCode:'TEST0000001',branchName:'Test'}});
 assert.equal(updated.status,200); assert.equal(String(updated.json.data.phone),'9876543210');
 const after=await request(path); assert.equal(after.json.data.address,'Synthetic profile test'); assert.equal(after.json.data.bankDetails.accountNumber,'00123');
 const denied=await request(path,'PUT',{role:'A'}); assert.equal(denied.status,403);
 const dashboard=await request('/api/dashboard'); assert.equal(dashboard.status,200); assert.equal(dashboard.json.data.isEmployee,true);
 console.log('5 profile API checks passed: own read, save, persisted read, role protection, personal dashboard.');
} finally {
 if(employee) await db.employee.delete({where:{id:employee.id}});
 await db.$disconnect();
}
