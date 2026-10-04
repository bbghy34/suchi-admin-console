/** Read-only timings against a disposable local DB/server. No real portal calls. */
import {PrismaClient} from '@prisma/client';
import jwt from 'jsonwebtoken';
import {createHash} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
const base=process.env.CONSOLE_TEST_URL;
if(!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(base||'') || !/^postgresql:\/\/[^@]+@(?:127\.0\.0\.1|localhost):\d+\/suchii_desk_test(?:\?|$)/.test(process.env.DATABASE_URL||''))throw Error('Use the disposable local database/server');
const db=new PrismaClient();
try {
 const actors={};for(const role of ['A','AA']){
  const e=await db.employee.findFirst({where:{name:'Console QA '+role,role}});if(!e)throw Error('Run module fixtures first');
  actors[role]=jwt.sign({id:e.id,role,cv:createHash('sha256').update(e.passwordHash).digest('hex').slice(0,16)},process.env.JWT_SECRET,{expiresIn:'10m'});
 }
 const paths=['dashboard','projects','boqs','employees','attendance','reports?reportType=projects','warehouse/summary','warehouse/reports?type=consumption','warehouse/reports?type=valuation','parties','bills/summary','desk/notifications','desk/portal-import','desk/portal-import/jobs','desk/search'];
 const results=[];
 for(const path of paths){
  const times=[];let bytes=0;
  for(let n=0;n<7;n++){
   const start=performance.now(),token=actors[/^(parties|bills)/.test(path)?'AA':'A'];
   const r=await fetch(base+'/api/'+path,{headers:{cookie:'auth_token='+token,Authorization:'Bearer '+token},signal:AbortSignal.timeout(30000)});
   const body=await r.text();if(!r.ok)throw Error(path+' '+r.status);
   if(n)times.push(performance.now()-start);bytes=Buffer.byteLength(body);
  }
  times.sort((a,b)=>a-b);results.push({path,medianMs:+((times[2]+times[3])/2).toFixed(2),maxMs:+times.at(-1).toFixed(2),bytes});
 }
 await writeFile(process.argv[2],JSON.stringify(results,null,2));console.log(JSON.stringify(results));
}finally{await db.$disconnect()}
