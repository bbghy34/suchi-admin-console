import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import {PrismaClient} from '@prisma/client';
import {saveReviewArtifacts,readOwnedArtifact} from '../lib/desk/portal-import/artifacts.mjs';
const bytes=Buffer.from('%PDF-1.7\noriginal-byte-fixture');
const packet={sourceUrl:'https://example.gov.in/notice.pdf',fields:{Title:'Unverified work'},evidence:{missing:['closing time']},documents:[{name:'notice.pdf',bytes,sourceUrl:'https://example.gov.in/notice.pdf'}]};
test('review artifact limits reject before starting a database transaction',async()=>{
 const db={$transaction:()=>{throw Error('Must not start transaction');}};
 await assert.rejects(saveReviewArtifacts(db,'owner','request',{documents:[]}),/one to eight/);
 await assert.rejects(saveReviewArtifacts(db,'owner','request',{documents:[{name:'large.pdf',bytes:Buffer.alloc(50*1024*1024+1)}]}),/exceeds 50 MB/);
 await assert.rejects(saveReviewArtifacts(db,'owner','request',{documents:Array(9).fill(packet.documents[0])}),/one to eight/);
 await assert.rejects(saveReviewArtifacts(db,'owner','request',{documents:[{name:'file',bytes:Buffer.alloc(0)}]}),/missing or empty/);
});
const url=process.env.TEST_ARTIFACT_DATABASE_URL;
test('durable bytes, hashes, provenance, dedupe, ownership and transactional rollback',{skip:!url},async()=>{
 const parsed=new URL(url);
 assert.ok(['127.0.0.1','localhost'].includes(parsed.hostname)&&parsed.pathname==='/suchii_desk_test','Use the disposable local suchii_desk_test database only');
 const db=new PrismaClient({datasourceUrl:url}),owner='artifact-test-'+randomUUID(),request=randomUUID();
 let tableReady=false;
 try{
  const exists=await db.$queryRaw`SELECT to_regclass('"DeskRetrievalArtifact"')::text AS name`;
  if(!exists[0].name){const sql=await fs.readFile(new URL('../prisma/migrations/20261001_retrieval_artifacts/migration.sql',import.meta.url),'utf8');for(const statement of sql.split(';').map(s=>s.trim()).filter(Boolean))await db.$executeRawUnsafe(statement);}
  tableReady=true;
  const saved=await saveReviewArtifacts(db,owner,request,packet);assert.equal(saved.length,2);assert.equal(saved[0].size,bytes.length);assert.equal(saved[0].sha256,createHash('sha256').update(bytes).digest('hex'));
  const original=await readOwnedArtifact(db,owner,saved[0].id);assert.deepEqual(original.bytes,bytes);assert.equal(original.mime,'application/pdf');
  assert.equal(await readOwnedArtifact(db,'other-owner',saved[0].id),null);assert.equal(await readOwnedArtifact(db,owner,'not-an-id'),null);
  const record=JSON.parse((await readOwnedArtifact(db,owner,saved[1].id)).bytes.toString());assert.equal(record.reviewRequired,true);assert.equal(record.documents[0].sha256,saved[0].sha256);assert.deepEqual(record.evidence,{missing:['closing time']});assert.equal(record.ownerId,undefined);
  const again=await saveReviewArtifacts(db,owner,request,packet);assert.deepEqual(again.map(d=>d.id),saved.map(d=>d.id));
  const failingRequest=randomUUID();let inserts=0;
  const failing={$transaction:work=>db.$transaction(tx=>work({$queryRaw:(...args)=>{if(++inserts===2)throw Error('Forced record failure');return tx.$queryRaw(...args);}}))};
  await assert.rejects(saveReviewArtifacts(failing,owner,failingRequest,packet),/Forced record failure/);
  const remaining=await db.$queryRaw`SELECT COUNT(*)::int AS count FROM "DeskRetrievalArtifact" WHERE "ownerId"=${owner} AND "requestId"=${failingRequest}`;assert.equal(remaining[0].count,0);
 }finally{try{if(tableReady)await db.$executeRaw`DELETE FROM "DeskRetrievalArtifact" WHERE "ownerId"=${owner}`;}finally{await db.$disconnect();}}
});

test('artifact endpoint sends exact attachment bytes and never exposes another owner',async()=>{
 const source=await fs.readFile(new URL('../app/api/desk/portal-import/artifacts/[id]/route.js',import.meta.url),'utf8');
 const body=source.replace(/^import .*;\n/gm,'').replace(/^export const .*;\n/gm,'').replace('export async function GET','async function GET');
 class HttpError extends Error{constructor(status,message){super(message);this.status=status;}}
 let owner='owner-one',calls=0;
 const get=Function('prisma','requirePerson','HttpError','readOwnedArtifact',body+'\nreturn GET;')({},async()=>{if(!owner)throw new HttpError(401,'Sign in required');return{id:owner};},HttpError,async(_db,currentOwner)=>{calls++;return currentOwner==='owner-one'?{name:'notice.pdf',mime:'application/pdf',bytes}:null;});
 const response=await get(null,{params:Promise.resolve({id:randomUUID()})});
 assert.equal(response.status,200);assert.deepEqual(Buffer.from(await response.arrayBuffer()),bytes);
 assert.equal(response.headers.get('x-content-type-options'),'nosniff');assert.equal(response.headers.get('cache-control'),'private, no-store');assert.match(response.headers.get('content-disposition'),/^attachment/);
 owner='owner-two';assert.equal((await get(null,{params:{id:randomUUID()}})).status,404);
 owner=null;assert.equal((await get(null,{params:{id:randomUUID()}})).status,401);assert.equal(calls,2);
});
