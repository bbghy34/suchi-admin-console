import { createHash, randomUUID } from 'node:crypto';
const MAX_BYTES=50*1024*1024;
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const MIME={pdf:'application/pdf',doc:'application/msword',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',xls:'application/vnd.ms-excel',xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',zip:'application/zip',txt:'text/plain',json:'application/json'};
function failure(message){const error=new Error(message);error.code='REVIEW_ARTIFACT_LIMIT';error.status=422;return error;}
function safeName(name){
 const value=String(name||'official-file').replace(/[\\/\x00-\x1f\x7f]/g,'_').trim();
 return value.slice(0,240)||'official-file';
}
const describe=row=>({id:row.id,name:row.name,mime:row.mime,size:Number(row.size),sha256:row.sha256,downloadUrl:`/api/desk/portal-import/artifacts/${row.id}`});

/** Atomic durable originals; these are pending files, not a verified tender record. */
export async function saveReviewArtifacts(db,ownerId,requestId,packet){
 if(typeof ownerId!=='string'||!ownerId||typeof requestId!=='string'||!requestId)throw failure('A signed-in owner and retrieval reference are required.');
 const originals=packet?.documents;
 if(!Array.isArray(originals)||!originals.length||originals.length>8)throw failure('Manual review supports one to eight original files.');
 let originalSize=0;
 for(const item of originals){
  if(!(item?.bytes instanceof Uint8Array)||!item.bytes.byteLength)throw failure('An original file is missing or empty.');
  originalSize+=item.bytes.byteLength;
  if(originalSize>MAX_BYTES)throw failure('The review packet exceeds 50 MB.');
 }
 const files=originals.map(item=>{
  if(!(item.bytes instanceof Uint8Array)||!item.bytes.byteLength)throw failure('An original file is missing or empty.');
  const bytes=Buffer.from(item.bytes),name=safeName(item.name);
  return {name,bytes,mime:MIME[name.split('.').at(-1).toLowerCase()]||'application/octet-stream',sha256:hash(bytes),sourceUrl:typeof item.sourceUrl==='string'?item.sourceUrl:packet.sourceUrl||null};
 });
 let total=files.reduce((n,file)=>n+file.bytes.length,0);
 if(total>MAX_BYTES)throw failure('The review packet exceeds 50 MB.');
 const source={schemaVersion:1,requestId,reviewRequired:true,sourceUrl:packet.sourceUrl||null,retrievedAt:packet.retrievedAt||null,fields:packet.fields||{},discovery:packet.discovery||packet.evidence?.discovery||null,evidence:packet.evidence||{},manifest:packet.manifest||[],documents:files.map(({bytes,...file})=>({...file,size:bytes.length}))};
 const record=Buffer.from(JSON.stringify(source,(key,value)=>['bytes','apiKey','cookie','authorization','password','token'].includes(key)?undefined:value,2));
 total+=record.length;if(total>MAX_BYTES)throw failure('The review packet and source record exceed 50 MB.');
 files.push({name:'source-record.json',bytes:record,mime:'application/json',sha256:hash(record),sourceUrl:packet.sourceUrl||null});
 return db.$transaction(async tx=>{
  const output=[];
  for(const file of files){
   const id=randomUUID();
   const rows=await tx.$queryRaw`
    INSERT INTO "DeskRetrievalArtifact" ("id","requestId","ownerId","name","mime","sha256","sourceUrl","bytes")
    VALUES (${id},${requestId},${ownerId},${file.name},${file.mime},${file.sha256},${file.sourceUrl},${file.bytes})
    ON CONFLICT ("ownerId","requestId","sha256") DO UPDATE SET "sha256" = EXCLUDED."sha256"
    RETURNING "id","name","mime","sha256",octet_length("bytes") AS "size"
   `;
   const item=describe(rows[0]);if(!output.some(existing=>existing.id===item.id))output.push(item);
  }
  return output;
 });
}

/** Owner equality is enforced in the same query as the opaque artifact ID. */
export async function readOwnedArtifact(db,ownerId,id){
 if(typeof ownerId!=='string'||!ownerId||typeof id!=='string'||!/^[0-9a-f-]{36}$/i.test(id))return null;
 const rows=await db.$queryRaw`SELECT "id","requestId","ownerId","name","mime","sha256","sourceUrl","bytes","createdAt" FROM "DeskRetrievalArtifact" WHERE "id"=${id} AND "ownerId"=${ownerId} LIMIT 1`;
 return rows[0]?{...rows[0],bytes:Buffer.from(rows[0].bytes)}:null;
}
