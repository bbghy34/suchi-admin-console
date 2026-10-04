/** Bounded live verification. Explicit portal IDs; at most one selected notice per portal. */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { PORTALS } from '../lib/desk/portal-import/identity.mjs';
import { AssamPortal } from '../lib/desk/portal-import/assam.mjs';
import { extractOfficialDocument } from '../lib/desk/portal-import/extract.mjs';
const ids=process.argv.slice(2);
if (!ids.length || ids.some(id=>!PORTALS.some(p=>p.id===id))) throw new Error('Supply explicit registered portal IDs');
const directory='tools/assam-tenders/verification/multi-portal';
mkdirSync(directory,{recursive:true});
for(const id of ids) {
 const target=`${directory}/${id}-download.json`;
 if(existsSync(target) && JSON.parse(readFileSync(target)).ok) {console.log(JSON.stringify({id,skipped:'already verified'}));continue;}
 const probe=JSON.parse(readFileSync(`${directory}/${id}-probe.json`));
 const tenderId=probe.sample?.fields['Tender ID'];
 if(!tenderId) {console.log(JSON.stringify({id,skipped:'No exact tender discovered'}));continue;}
 const client=new AssamPortal({portal:PORTALS.find(p=>p.id===id),apiKey:process.env.TWOCAPTCHA_API_KEY,onEvent:e=>{if(e.event==='phase') console.log(JSON.stringify({id,...e}));}});
 const started=Date.now();const result={id,tenderId,at:new Date().toISOString(),ok:false};
 try {
  const packet=await client.retrieve(tenderId,{detailLink:probe.sample.link});
  result.fields=packet.fields;result.files=[];
  mkdirSync(`${directory}/${id}`,{recursive:true});
  for(const doc of packet.documents) {
   writeFileSync(`${directory}/${id}/${doc.name}`,doc.bytes);
   let extracted;
   try { extracted=await extractOfficialDocument(doc.bytes,/\.pdf$/i.test(doc.name)?'application/pdf':/\.xls$/i.test(doc.name)?'application/vnd.ms-excel':'application/octet-stream',doc.name); } catch(error) { extracted={status:'ERROR',text:'',metadata:{error:error.message}}; }
   const digest=createHash('sha256').update(doc.bytes).digest('hex');
   if(digest!==doc.sha256) throw new Error('File hash mismatch');
   writeFileSync(`${directory}/${id}/${doc.name}`,doc.bytes);
   writeFileSync(`${directory}/${id}/${doc.name}.text.txt`,extracted.text||'');
   result.files.push({name:doc.name,size:doc.bytes.length,sha256:digest,status:extracted.status,metadata:extracted.metadata});
  }
  result.ok=true;
  result.extractionWarnings=result.files.filter(f=>f.status!=="TEXT").map(f=>f.name);
 }catch(error){result.error=error.message;result.retryAt=error.retryAt||null;}
 result.metrics=client.metrics;result.seconds=(Date.now()-started)/1000;
 writeFileSync(target,JSON.stringify(result,null,2));
 console.log(JSON.stringify({event:'verified',id,tenderId,ok:result.ok,seconds:result.seconds,files:result.files?.length,error:result.error,metrics:result.metrics}));
}
