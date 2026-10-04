import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const workerSource = fs.readFileSync(new URL('../lib/desk/portal-import/job-worker.js', import.meta.url), 'utf8');
function worker(run, options = {}) {
 let clock = Date.now(), completed, calls = 0;
 const events=[];
 const db={person:{findUnique:async()=>({id:'p',employeeId:'e',roles:'ADMIN'})},employee:{findUnique:async()=>({id:'e',role:'A',status:true})}};
 const context=vm.createContext({Request,console,setInterval,clearInterval,setTimeout,Date,
 prisma:db,runImport:run,claimJob:async()=>({ownerId:'p',claimToken:'claim',payload:{row:{title:'Test'}}}),
 heartbeatJob:async(_db,_id,_token,event)=>{if(event)events.push(event);return options.claim !== false;},
 finishJob:async(_db,_id,_token,result)=>{completed=result;return {status:result.ok?'SUCCEEDED':'FAILED'};},
 isActiveAccount:e=>e.status,rolesForConsole:()=> 'ADMIN',personRoles:()=>['ADMIN'],decoratePerson:p=>p,
 chooseDefaultOfficialNotice:()=>null,
 });
 vm.runInContext(workerSource.replace(/^import .*;\n/gm,'').replace('export async function executeImportJob','async function executeImportJob'),context);
 return {events,execute:async()=>{await context.executeImportJob('job',{db,run:async(...args)=>{calls++;return run(...args);},now:()=>clock,sleep:async ms=>{clock+=ms;},portalPollMs:10,portalWaitMs:30,...options});return {result:completed,calls};}};
}
const busy = () => Response.json({ok:false,code:'PORTAL_BUSY'}, {status:429});
test('busy session waits visibly then retrieves once instead of failing immediately',async()=>{
 let paid=0,checks=0;
 const w=worker(async()=>++checks<=2 ? busy() : (paid++,Response.json({ok:true,documentCount:2})));
 const {result,calls}=await w.execute();
 assert.equal(result.ok,true);assert.equal(calls,3);assert.equal(paid,1);
 assert.ok(w.events.some(e=>e.message.includes('start automatically')));
});
test('queue has a finite wait budget and preserves retryAt',async()=>{
 const {result,calls}=await worker(busy).execute();
 assert.equal(calls,4);assert.equal(result.code,'PORTAL_BUSY');assert.ok(result.retryAt>0);
 assert.match(result.error,/still busy/);
});
test('other throttles and download failures are never retried as queued work',async()=>{
 for(const response of [()=>Response.json({ok:false,code:'CAPTCHA_FAILED'},{status:502}),()=>Response.json({ok:false,code:'PORTAL_RATE_LIMIT',retryAt:123},{status:429})]){
 const {calls}=await worker(response).execute();assert.equal(calls,1);
 }
});
test('lost job claim prevents another retrieval attempt',async()=>{
 const {calls,result}=await worker(busy,{claim:false}).execute();
 assert.equal(calls,1);assert.equal(result.ok,false);
});

const store = fs.readFileSync(new URL('../lib/desk/portal-import/store.mjs', import.meta.url), 'utf8');
const leaseSource=store.slice(store.indexOf('export async function acquirePortalLease')).replaceAll('export async function','async function');
function leases() {
 class FetchError extends Error {constructor(message, opts){super(message);Object.assign(this,opts);}}
 const context=vm.createContext({PortalFetchError:FetchError,randomUUID:()=> 'owner',Date});
 vm.runInContext(leaseSource,context);return context;
}
test('two portal slots can acquire separately, third waits, release targets only owned slot',async()=>{
 const held=new Map();let released;
 const db={$queryRawUnsafe:async(_sql,owner,key)=>{
  if (_sql.startsWith('SELECT')) return [];
  if(held.has(key))return [];const value=`999999|${owner}`;held.set(key,value);return [{value}];
 },$executeRawUnsafe:async(_sql,value,lease,key)=>{released={value,lease,key};}};
 const l=leases();const first=await l.acquirePortalLease(db,'assam');const second=await l.acquirePortalLease(db,'assam');
 assert.notEqual(first,second);assert.equal(held.size,2);
 await assert.rejects(l.acquirePortalLease(db,'assam'),e=>e.code==='PORTAL_BUSY'&&e.status===429&&e.retryAt>Date.now());
 await l.releasePortalLease(db,second,null,'assam');
 assert.equal(released.key,'portalImport:assam:lease:slot:1');assert.equal(released.lease,second);
 await l.releasePortalLease(db,first,null,'assam');assert.equal(released.key,'portalImport:assam:lease');
});
test('pre-session shared cooldown waits safely but respects a long Retry-After',async()=>{
 let calls=0;
 const w=worker(async()=>++calls===1
  ? Response.json({ok:false,code:'PORTAL_COOLDOWN'},{status:429})
  : Response.json({ok:true}));
 assert.equal((await w.execute()).result.ok,true);
 assert.ok(w.events.some(e=>e.message.includes('portal asked us to pause')));
 const retryAt=Date.now()+3600000;
 const long=await worker(async()=>Response.json({ok:false,code:'PORTAL_COOLDOWN',retryAt},{status:429})).execute();
 assert.equal(long.calls,1);assert.equal(long.result.retryAt,retryAt);
});
