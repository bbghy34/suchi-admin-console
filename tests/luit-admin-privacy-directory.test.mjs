import test from 'node:test';
import assert from 'node:assert/strict';
import { hideLuitAdminResponse } from '../lib/luit-admin/privacy.mjs';
import { readFile } from 'node:fs/promises';
import { employeeDirectoryWhere, personDirectoryWhere, findDirectoryPerson } from '../lib/luit-admin/privacy.mjs';
import { normalizeResourceUrl } from '../lib/security.js';
import { isLuitAdmin, isExcludedStaffRole, publicRole, isAssignableRole } from '../lib/roles.js';
import { passwordProblem } from '../lib/password-policy.mjs';
const visible={id:'visible',role:'E',name:'Visible staff',department:{HOD:'hidden'}}, hidden={id:'hidden',role:'SX',name:'Private account'};
const reply=(data,message,status=200)=>Response.json({data,message},{status});
const error=(message,status=400)=>reply(null,message,status);
function matches(row,where={}) {
 if(where.AND&&!where.AND.every(w=>matches(row,w)))return false;
 if(where.OR&&!where.OR.some(w=>matches(row,w)))return false;
 if(where.NOT&&matches(row,where.NOT))return false;
 for(const [key,value] of Object.entries(where)) {
  if(['AND','OR','NOT'].includes(key))continue;
  const actual=row[key];
  if(value===null) {if(actual!=null)return false;}
  else if(typeof value==='object') {
   if(value.equals!==undefined&&(value.mode==='insensitive'?String(actual).toLowerCase()!==String(value.equals).toLowerCase():actual!==value.equals))return false;
   if(value.notIn?.includes(actual))return false;
  } else if(actual!==value)return false;
 }return true;
}
function dbStub() {
 const staff=[visible,hidden], people=[{id:'p1',employeeId:'visible',name:'Visible'},{id:'p2',employeeId:'hidden',name:'Private'},{id:'legacy',employeeId:null,name:'Legacy'}];
 return {
 $queryRaw:async()=>[{id:'hidden'}],
 employee:{findMany:async({where})=>staff.filter(r=>matches(r,where)),findFirst:async({where})=>staff.find(r=>matches(r,where))||null,count:async({where})=>staff.filter(r=>matches(r,where)).length,update:async({where,data})=>({...staff.find(r=>r.id===where.id),...data})},
 person:{findMany:async({where})=>people.filter(r=>matches(r,where)),findFirst:async({where})=>people.find(r=>matches(r,where))||null,update:async()=>{throw Error('Unexpected person mutation')}},site:{findMany:async()=>[]},
 };
}
async function route(path,prisma) {
 const source=(await readFile(new URL('../'+path,import.meta.url),'utf8')).replace(/^import .*;\n/gm,'');
 const bindings={prisma,hideLuitAdminResponse,baseSuccessResponse:reply,normalizeResourceUrl,employeeDirectoryWhere,personDirectoryWhere,findDirectoryPerson,isLuitAdmin,isHiddenRole:isLuitAdmin,isExcludedStaffRole,passwordProblem,publicRole,isAssignableRole,requireAuth:fn=>fn,requireRoles:()=>fn=>fn,requireRole:async()=>({id:'admin',roles:['ADMIN']}),handler:fn=>fn,errorResponse:error,notFound:m=>error(m,404),forbidden:m=>error(m,403),conflict:m=>error(m,409),handleApiError:e=>{throw e},sanitizeEmployee:e=>({...e}),filterAllowedEmployeeUpdates:()=>({}),invalidateSession:()=>{},hashPassword:async()=>'',ROLES:{ADMIN:'A',MANAGER:'M',EMPLOYEE:'E',ACCOUNTANT:'AA'},ok:data=>Response.json(data),fail:(status,message)=>error(message,status),readBody:async req=>({fields:await req.json()}),str:x=>String(x||''),setSetting:async()=>{throw Error('Unexpected settings mutation')},SETTING_KEYS:{},logActivity:async()=>{}};
 const key='sx_route_'+Math.random().toString(36).slice(2);globalThis[key]=bindings;
 try{return await import('data:text/javascript;base64,'+Buffer.from(`const {${Object.keys(bindings).join(',')}}=globalThis['${key}'];\n`+source).toString('base64'));}finally{delete globalThis[key];}
}
test('directory filtering remains conjunctive under explicit role SX and arbitrary search',()=>{
 assert.equal(matches(hidden,employeeDirectoryWhere()),false);assert.equal(matches({...hidden,role:'sx'},employeeDirectoryWhere()),false);
 assert.equal(matches(hidden,employeeDirectoryWhere({role:'SX'})),false);assert.equal(matches(visible,employeeDirectoryWhere()),true);
});
test('Desk person filter hides linked SX IDs and preserves unrelated legacy people',async()=>{
 const db=dbStub();assert.deepEqual((await db.person.findMany({where:await personDirectoryWhere(db)})).map(p=>p.id),['p1','legacy']);assert.equal(await findDirectoryPerson(db,'p2'),null);
});
test('employee endpoint list and pagination counts omit SX even to SX requester',async()=>{
 const r=await route('app/api/employees/route.js',dbStub());
 for(const id of ['admin','hidden']){const result=await r.GET(new Request('http://local/api/employees'),{user:{id,role:'A'}});const body=await result.json();assert.deepEqual(body.data.map(e=>e.id),['visible']);assert.equal(body.pagination.total,1);assert.equal(body.data[0].department.HOD,null);}
 const result=await r.GET(new Request('http://local/api/employees?role=SX'),{user:{id:'admin',role:'A'}});assert.equal((await result.json()).pagination.total,0);
});
test('other-user hidden direct ID read/update/delete returns404 and never writes',async()=>{
 const db=dbStub();let mutations=0;db.employee.update=async()=>{mutations++;throw Error('Unexpected write')};
 const r=await route('app/api/employees/[id]/route.js',db);
 for(const method of ['GET','PUT','DELETE']) {const result=await r[method](new Request('http://local/api/employees/hidden',{method, ...(method==='PUT'?{body:JSON.stringify({name:'changed'})}:{})}),{params:Promise.resolve({id:'hidden'}),user:{id:'admin',role:'A'}});assert.equal(result.status,404);}
 assert.equal(mutations,0);
});
test('private self profile remains usable while self delete is blocked',async()=>{
 const r=await route('app/api/employees/[id]/route.js',dbStub()), context={params:Promise.resolve({id:'hidden'}),user:{id:'hidden',role:'A'}};
 const get=await r.GET(new Request('http://local/api/employees/hidden'),context);assert.equal(get.status,200);assert.equal((await get.json()).data.role,'A');
 const put=await r.PUT(new Request('http://local/api/employees/hidden',{method:'PUT',body:JSON.stringify({name:'Account name',role:'E'})}),context);assert.equal(put.status,200);assert.equal((await put.json()).data.role,'A');
 assert.equal((await r.DELETE(new Request('http://local/api/employees/hidden',{method:'DELETE'}),context)).status,404);
});
test('Desk directory and direct role mutation hide SX; assigning hidden fetcher rejected',async()=>{
 const db=dbStub(),r=await route('app/api/desk/people/route.js',db);assert.deepEqual((await(await r.GET()).json()).people.map(p=>p.id),['p1','legacy']);
 for(const field of ['fetchAssigneeId','fetchBackupId'])assert.equal((await r.PATCH(new Request('http://local/api/desk/people',{method:'PATCH',body:JSON.stringify({[field]:'p2'})}))).status,400);
 const detail=await route('app/api/desk/people/[id]/route.js',db);assert.equal((await detail.PATCH(new Request('http://local/api/desk/people/p2',{method:'PATCH',body:'{}'}),{params:Promise.resolve({id:'p2'})})).status,404);
});
