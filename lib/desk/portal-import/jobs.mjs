import { recordImportStage } from './stages.mjs';
import { createHash, randomUUID } from 'node:crypto';

const PREFIX = 'portalImport:job:';
// A running job heartbeats every 15 s, and its serverless function can live
// at most 300 s. Two minutes of silence, or a run past 330 s, means the worker
// is gone; showing that quickly beats a long "Running" that never moves.
export const JOB_STALE_MS = 2 * 60 * 1000;
export const JOB_MAX_RUN_MS = 330 * 1000;
export function isStaleJob(job, now = Date.now()) {
  if (!ACTIVE.includes(job?.status)) return false;
  const since = Date.parse(job.status === 'QUEUED' ? job.createdAt : (job.heartbeatAt || job.startedAt || job.createdAt));
  if (Number.isFinite(since) && now - since > JOB_STALE_MS) return true;
  const started = Date.parse(job.startedAt || '');
  return job.status === 'RUNNING' && Number.isFinite(started) && now - started > JOB_MAX_RUN_MS;
}
const ACTIVE = ['QUEUED', 'RUNNING'];
const TERMINAL = ['SUCCEEDED', 'FAILED', 'NEEDS_INPUT', 'NEEDS_REVIEW', 'INTERRUPTED'];
const key = id => `${PREFIX}${id}`;
// Hosted Postgres can spend several seconds on connection and query round trips.
// Keep the owner lock/CAS atomic without the default five-second expiry.
const transaction = (db, work) => typeof db.$transaction === 'function'
  ? db.$transaction(work, { maxWait: 10000, timeout: 20000 }) : work(db);
const nowISO = now => new Date(now).toISOString();
function fail(message, status = 400) { const error = new Error(message); error.status = status; return error; }
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])]));
  return value;
}
export function validateJobPayload(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw fail('Choose a tender search result.');
  const allowed = new Set(['row', 'link', 'tenderId', 'reference', 'query']);
  if (Object.keys(input).some(k => !allowed.has(k))) throw fail('Unsupported official retrieval input.');
  const encoded = JSON.stringify(input);
  if (Buffer.byteLength(encoded, 'utf8') > 20000) throw fail('Official retrieval request is too large.', 413);
  const payload = JSON.parse(encoded);
  if (!payload.row && !payload.link) throw fail('Choose a tender search result or official link.');
  if (payload.row && (typeof payload.row !== 'object' || Array.isArray(payload.row))) throw fail('Choose a tender search result.');
  for (const field of ['link','tenderId','reference','query']) if (payload[field] !== undefined && typeof payload[field] !== 'string') throw fail(`Invalid ${field}.`);
  if (payload.row) {
    const rowFields = new Set(['title','link','detail','portalTenderId','reference','documents']);
    if (Object.keys(payload.row).some(k=>!rowFields.has(k))) throw fail('Unsupported search result input.');
    for (const [field,value] of Object.entries(payload.row)) {
      if (value === null) { delete payload.row[field]; continue; }
      if (field !== 'documents' && typeof value !== 'string') throw fail('Invalid search result field.');
    }
    if (payload.row.documents !== undefined) {
      if (!Array.isArray(payload.row.documents) || payload.row.documents.length > 30) throw fail('Invalid document references.');
      for (const doc of payload.row.documents) if (!doc || typeof doc !== 'object' || Array.isArray(doc) || Object.keys(doc).some(k=>!['url','name','title','type'].includes(k)) || Object.values(doc).some(v=>typeof v!=='string')) throw fail('Invalid document reference.');
    }
  }
  return canonical(payload);
}
function safeResult(result = {}) {
  const out = {};
  for (const field of ['code','ok','tenderId','existing','needsChoice','matches','message','error','retryAt','requestId','elapsedMs','documentCount','savedDocuments','downloadWarnings','captureScope','warnings','extractionWarnings','completeness','needsReview','artifacts']) if (result[field] !== undefined) out[field] = result[field];
  if (Array.isArray(out.artifacts)) out.artifacts = out.artifacts.slice(0,100).filter(file => file && typeof file.id==='string' && /^[A-Za-z0-9_-]+$/.test(file.id) && file.downloadUrl===`/api/desk/portal-import/artifacts/${file.id}`).map(file=>({
    id:file.id,name:String(file.name||'Official document').slice(0,300),mime:String(file.mime||'application/octet-stream').slice(0,120),
    size:Number.isFinite(file.size)&&file.size>=0?file.size:0,sha256:/^[a-f0-9]{64}$/i.test(file.sha256||'')?file.sha256:undefined,downloadUrl:file.downloadUrl,
  }));
  const encoded = JSON.stringify(out, (k,v) => /^(?:apiKey|token|claimToken|ownerId|payload|cookie|authorization|password|secret)$/i.test(k) ? undefined : v);
  if (Buffer.byteLength(encoded,'utf8') > 60000) throw fail('Official retrieval result exceeds the job size limit.');
  return JSON.parse(encoded);
}
export function publicJob(job, now = Date.now()) {
  if (!job) return null;
  return {
    id: job.id, status: job.status, title: String(job.payload?.row?.title || job.payload?.tenderId || "").slice(0,240), query: String(job.payload?.query || "").slice(0,240), progressMessage: job.progressMessage,
    stage: job.stage || null, captchaAttempt: job.captchaAttempt || null, stageHistory: job.stageHistory || [],
    createdAt: job.createdAt, startedAt: job.startedAt, finishedAt: job.finishedAt,
    heartbeatAt: job.heartbeatAt, elapsedMs: job.elapsedMs ?? (job.startedAt ? Math.max(0, now - Date.parse(job.startedAt)) : 0),
    resultJSON: job.result ? safeResult(job.result) : null, result: job.result ? safeResult(job.result) : null, error: job.error, retryAt: job.retryAt,
    canRetry: ['FAILED','INTERRUPTED'].includes(job.status),
    // The public official notice URL, so a failed download can link back to it.
    sourceLink: publicLink(job.payload?.row?.link || job.payload?.link),
  };
}
function publicLink(value) {
  try { const url = new URL(String(value || '')); return ['https:','http:'].includes(url.protocol) && !url.username && !url.password ? url.href.slice(0, 2000) : null; }
  catch { return null; }
}
async function read(db,id) {
  if (!/^[0-9a-f-]{36}$/i.test(String(id))) return null;
  const row = await db.setting.findUnique({where:{key:key(id)}});
  return row ? {raw:row.value, job:JSON.parse(row.value)} : null;
}
async function cas(db, record, next) {
  const result = await db.setting.updateMany({where:{key:key(record.job.id),value:record.raw},data:{value:JSON.stringify(next)}});
  return result.count === 1;
}
// The fixed pattern below must match migration 20261003_import_job_index
// exactly: Postgres only uses that partial expression index when the query
// repeats its predicate and expressions as written.
const JOB_ROWS = `"key" LIKE '${PREFIX}%'`;
const jobField = field => `(CASE WHEN ${JOB_ROWS} THEN "value"::jsonb->>'${field}' END)`;
async function ownedRows(db, ownerId, activeOnly = false, limit = 20) {
  return db.$queryRawUnsafe(`SELECT "key", "value" FROM "DeskSetting"
    WHERE ${JOB_ROWS} AND "key" LIKE $1
    AND ${jobField('ownerId')} = $2
    AND (NOT $3::boolean OR ${jobField('status')} IN ('QUEUED','RUNNING'))
    ORDER BY CASE WHEN ${jobField('status')} IN ('QUEUED','RUNNING') THEN 0 ELSE 1 END,
      ${jobField('createdAt')} DESC LIMIT $4`, `${PREFIX}%`, ownerId, activeOnly, limit);
}

/**
 * Finished downloads older than 30 days are removed so the job list stays
 * small. Jobs that still need a person (review or a notice choice) are kept.
 * Runs at most every six hours per server and never fails the request.
 */
export const JOB_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const PRUNE_EVERY_MS = 6 * 60 * 60 * 1000;
let lastPrune = 0;
export function pruneFinishedJobs(db, now = Date.now()) {
  if (typeof db?.$executeRawUnsafe !== 'function' || now - lastPrune < PRUNE_EVERY_MS) return Promise.resolve(0);
  lastPrune = now;
  return db.$executeRawUnsafe(`DELETE FROM "DeskSetting"
    WHERE ${JOB_ROWS}
    AND ${jobField('status')} IN ('SUCCEEDED','FAILED','INTERRUPTED')
    AND COALESCE(${jobField('finishedAt')}, ${jobField('createdAt')}) < $1`, new Date(now - JOB_RETENTION_MS).toISOString())
    .catch(() => 0);
}
export async function enqueueJob(db, ownerId, input, {now = Date.now()} = {}) {
  if (!ownerId || typeof ownerId !== 'string') throw fail('Sign in to retrieve official files.',401);
  const payload = validateJobPayload(input);
  const dedupeKey = createHash('sha256').update(`${ownerId}\n${JSON.stringify(payload)}`).digest('hex');
  await recoverInterruptedJobs(db,ownerId,{now});
  return transaction(db,async tx => {
    // Serialize enqueues for this owner: duplicate clicks cannot create paid work twice.
    await tx.$queryRawUnsafe('SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtext($1))',`portal-job-owner:${ownerId}`);
    const active = (await ownedRows(tx,ownerId,true,4)).map(r=>JSON.parse(r.value));
    const duplicate = active.find(j=>j.dedupeKey===dedupeKey);
    if (duplicate) return {job:publicJob(duplicate,now),existing:true};
    if (active.length >= 3) throw fail('You already have three official retrievals in progress. Wait for one to finish.',429);
    const job = {schemaVersion:1,id:randomUUID(),ownerId,payload,dedupeKey,status:'QUEUED',stage:null,captchaAttempt:null,stageHistory:[],attempt:0,claimToken:null,progressMessage:'Waiting to retrieve official files.',createdAt:nowISO(now),startedAt:null,finishedAt:null,heartbeatAt:nowISO(now),elapsedMs:null,result:null,error:null,retryAt:null};
    await tx.setting.create({data:{key:key(job.id),value:JSON.stringify(job)}});
    return {job:publicJob(job,now),existing:false};
  }).then(queued => { void pruneFinishedJobs(db, now); return queued; });
}
export async function claimJob(db,id,{now = Date.now()} = {}) {
  const record = await read(db,id);
  if (!record || record.job.status !== 'QUEUED' || record.job.attempt !== 0) return null;
  if (now - Date.parse(record.job.createdAt) > JOB_STALE_MS) { await interrupt(db,record,now); return null; }
  const next = {...record.job,...recordImportStage(record.job,{message:'Finding the official notice and checking saved tenders.',stage:'find'},nowISO(now)),status:'RUNNING',attempt:1,claimToken:randomUUID(),startedAt:nowISO(now),heartbeatAt:nowISO(now),progressMessage:'Finding the official notice and checking saved tenders.'};
  return await cas(db,record,next) ? next : null;
}
export async function heartbeatJob(db,id,claimToken,message,{now = Date.now()} = {}) {
  const record = await read(db,id);
  if (!record || record.job.status !== 'RUNNING' || record.job.claimToken !== claimToken) return false;
  const text = typeof message === 'string' ? message : message?.message;
  return cas(db,record,{...record.job,...recordImportStage(record.job,message,nowISO(now)),heartbeatAt:nowISO(now),progressMessage:typeof text==='string' ? text.slice(0,1000) : record.job.progressMessage});
}
async function terminal(db, record, next) {
  return transaction(db,async tx => {
    if (!await cas(tx,record,next)) return null;
    const successful = next.status === 'SUCCEEDED';
    const partial = successful && (next.result?.completeness === 'partial' || next.result?.downloadWarnings?.length);
    const subject = String(next.payload?.row?.title || next.payload?.tenderId || next.payload?.query || 'Official tender').slice(0,160);
    await tx.notification.upsert({where:{dedupeKey:`portal-job:${next.id}:terminal`},update:{},create:{
      personId:next.ownerId,tenderId:successful ? next.result?.tenderId || null : null,
      kind:'OFFICIAL_RETRIEVAL',title:next.status==='NEEDS_REVIEW'?'Files saved — details need review':successful?(partial?'Some official tender files are ready':'Official tender files are ready'):next.status==='NEEDS_INPUT'?'Choose the official tender match':'Official tender retrieval needs attention',
      body:`${subject}: ${partial ? "Some attachments need review. " : ""}${next.progressMessage} Open Downloads for details.`,dedupeKey:`portal-job:${next.id}:terminal`,
    }});
    return publicJob(next);
  });
}
export async function finishJob(db,id,claimToken,result,{now = Date.now(),status:requestedStatus} = {}) {
  const safe = safeResult(result);
  const status = requestedStatus || (safe.needsReview ? 'NEEDS_REVIEW' : safe.needsChoice ? 'NEEDS_INPUT' : safe.ok ? 'SUCCEEDED' : 'FAILED');
  if (!TERMINAL.includes(status)) throw fail('Invalid retrieval completion state.');
  const message = status==='NEEDS_REVIEW'?'Files saved. Review the documents and complete the tender details.':status==='SUCCEEDED'?(safe.completeness==='partial' || safe.downloadWarnings?.length ? 'Official files saved. Some attachments were unavailable; review the warnings on the tender.' : 'Official tender files are ready.'):status==='NEEDS_INPUT'?'Choose the matching official notice to continue.':String(safe.error || 'Official retrieval could not finish. Please try again.').slice(0,1000);
  // A final in-flight heartbeat may win the first CAS. Reload, retaining the
  // worker fence; never overwrite an interruption or another terminal result.
  for (let attempt=0; attempt<3; attempt++) {
    const record = await read(db,id);
    if (!record || record.job.status !== 'RUNNING' || record.job.claimToken !== claimToken) return null;
    const done = await terminal(db,record,{...record.job,...(status==='NEEDS_REVIEW'?recordImportStage(record.job,{stage:'save',message},nowISO(now)):{}),status,result:safe,error:status==='FAILED'||status==='INTERRUPTED'?message:null,retryAt:safe.retryAt || null,progressMessage:message,finishedAt:nowISO(now),heartbeatAt:nowISO(now),elapsedMs:Math.max(0,now-Date.parse(record.job.startedAt)),claimToken:null});
    if (done) return done;
  }
  return null;
}
async function interrupt(db,record,now) {
  const job=record.job;
  if (!ACTIVE.includes(job.status)) return null;
  return terminal(db,record,{...job,status:'INTERRUPTED',error:'The retrieval was interrupted. Review saved tenders before explicitly trying again.',progressMessage:'Retrieval interrupted. It was not restarted automatically.',finishedAt:nowISO(now),elapsedMs:Math.max(0,now-Date.parse(job.startedAt||job.createdAt)),claimToken:null});
}
export async function recoverInterruptedJobs(db,ownerId,{now = Date.now()} = {}) {
  const rows=await ownedRows(db,ownerId,true,4);let recovered=0;
  for(const row of rows){const record={raw:row.value,job:JSON.parse(row.value)};
    if(isStaleJob(record.job,now) && await interrupt(db,record,now)) recovered++;
  }
  return recovered;
}
export async function getJob(db,id,ownerId,{now = Date.now()} = {}) {
  let record=await read(db,id);
  if(!record || record.job.ownerId!==ownerId)return null;
  if(isStaleJob(record.job,now)){await interrupt(db,record,now);record=await read(db,id);}
  return publicJob(record.job,now);
}
export async function listJobs(db,ownerId,{now = Date.now()} = {}) {
  let rows = await ownedRows(db,ownerId,false,20);
  let changed = false;
  // Active jobs sort first and enqueue allows at most three per owner. Reuse
  // this read for recovery instead of querying active jobs on every poll.
  for (const row of rows) {
    const job = JSON.parse(row.value);
    if (isStaleJob(job,now)) {
      await interrupt(db,{raw:row.value,job},now);
      changed = true; // Also reload when another worker won the conditional write.
    }
  }
  if (changed) rows = await ownedRows(db,ownerId,false,20);
  return rows.map(r=>publicJob(JSON.parse(r.value),now));
}

/** Private retry input: callers must re-authorize and require an explicit user action. */
export async function getOwnedJobInput(db,id,ownerId) {
  const record = await read(db,id);
  return record?.job.ownerId === ownerId ? record.job.payload : null;
}
