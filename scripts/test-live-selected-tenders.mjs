/** Bounded live checks: selected search results only; isolated local schema required. */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {PrismaClient} from '@prisma/client';
const connection=new URL(process.env.DATABASE_URL);
assert.equal(connection.searchParams.get('schema'),'codex_portal_validation');
assert.match(connection.searchParams.get('options') || '',/search_path=codex_portal_validation/);
const base='http://127.0.0.1:3217';
const cases=JSON.parse(readFileSync(process.argv[2],'utf8'));
assert(cases.length>0 && cases.length<=6,'At most six explicitly selected results');
const output=process.argv[3];assert(output,'Output report path required');
const db=new PrismaClient();const results=[];
const login=await fetch(base+'/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:process.env.LOCAL_TEST_EMAIL,password:process.env.LOCAL_TEST_PASSWORD})});
assert.equal(login.status,200);const cookie=login.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');
try {
 for(const [index,item] of cases.entries()) {
  if(index) await new Promise(r=>setTimeout(r,12000));
  const started=Date.now();const result={name:item.name,query:item.query,startedAt:new Date().toISOString()};
  console.log(JSON.stringify({event:'started',name:item.name,index:index+1,total:cases.length}));
  try {
   const response=await fetch(base+'/api/desk/portal-import',{method:'POST',headers:{cookie,'content-type':'application/json'},body:JSON.stringify({row:item.row,query:item.query}),signal:AbortSignal.timeout(290000)});
   const data=await response.json();Object.assign(result,{status:response.status,seconds:(Date.now()-started)/1000,...data});
   if(data.ok && data.tenderId) {
    const tender=await db.tender.findUniqueOrThrow({where:{id:data.tenderId},include:{documents:true}});
    result.officialId=tender.portalTenderId;result.officialTitle=tender.title;
    const metadata=JSON.parse(tender.documents.find(d=>d.fileName==='official-record.txt').extractedText);
    result.originalImportMetrics=metadata.metrics;result.verifiedFiles=[];
    for(const doc of tender.documents.filter(d=>d.fileName!=='official-record.txt')) {
     const file=await fetch(base+'/api/desk/documents/'+doc.id,{headers:{cookie},signal:AbortSignal.timeout(30000)});
     assert.equal(file.status,200);const bytes=Buffer.from(await file.arrayBuffer());assert.equal(bytes.length,doc.size);
     assert.equal(createHash('sha256').update(bytes).digest('hex'),metadata.documents.find(d=>d.name===doc.fileName).sha256);
     result.verifiedFiles.push({name:doc.fileName,bytes:bytes.length,extractionStatus:doc.extractionStatus});
    }
    result.fileVerification='passed';
   }
  } catch(error) {result.testError=error.message;result.seconds=(Date.now()-started)/1000;}
  result.totalWithVerificationSeconds=(Date.now()-started)/1000;results.push(result);
  writeFileSync(output,JSON.stringify(results,null,2));
  console.log(JSON.stringify({event:'finished',name:result.name,status:result.status,seconds:result.seconds,existing:result.existing,files:result.verifiedFiles?.length,error:result.error || result.testError,needsChoice:result.needsChoice}));
 }
} finally {await db.$disconnect();}
