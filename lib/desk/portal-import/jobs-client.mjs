/** Shared browser transport contract; no portal requests are made from the browser. */
export const ACTIVE_IMPORT_JOB_STATUSES = new Set(['QUEUED', 'RUNNING']);
export function importJobBody(payload = {}) {
  const body = {};
  if(payload.query != null) body.query=payload.query;
  if (payload.row) {
    const row = payload.row;
    body.row = { title: row.title, link: row.link, detail: String(row.detail || '').slice(0,12000), portalTenderId:row.portalTenderId, reference:row.reference, documents:row.documents };
  } else {
    for (const key of ['link','tenderId','reference']) if(payload[key] != null) body[key]=payload[key];
  }
  // Hindi or Assamese evidence is ~3 bytes a character; trim the cited text, never identifiers.
  while (body.row?.detail && new TextEncoder().encode(JSON.stringify(body)).length>20000) body.row.detail=body.row.detail.slice(0,Math.floor(body.row.detail.length*0.7));
  const encoded=JSON.stringify(body);
  // Respect both the importer's character limit and the job queue's UTF-8 byte limit, without truncating identifiers.
  if(encoded.length>20000 || new TextEncoder().encode(encoded).length>20000) throw new Error('This search result contains too much detail. Open the official notice and submit its link instead.');
  if(!body.row && !body.link) throw new Error('Choose an official tender result first.');
  return encoded;
}
export function importJobResult(job) {
  const raw=job?.resultJSON ?? job?.result;
  if(raw && typeof raw==='object')return raw;
  try{return raw?JSON.parse(raw):null;}catch{return null;}
}
export async function readJobResponse(response) {
  const raw=await response.json().catch(()=>null);
  if(!response.ok || !raw || raw.ok===false) throw new Error(typeof raw?.error==='string'?raw.error:'Could not check background downloads. Please try again.');
  return raw.data ?? raw;
}

export function importJobRetryTime(job, now = Date.now()) {
 const raw=job?.retryAt ?? importJobResult(job)?.retryAt;
 const time=raw==null?NaN:new Date(raw).getTime();
 return Number.isFinite(time)&&time>now?time:null;
}
export function statusPollError(error, signal) {
 if(signal?.aborted && signal.reason?.name!=='TimeoutError')return '';
 return signal?.reason?.name==='TimeoutError'?'Checking download status took too long. Refresh to check again.':error.message || 'Could not check background downloads.';
}

/** Initial snapshot establishes a baseline; later unseen completions refresh inbox. */
export function importJobsCompletedSince(previous, jobs) {
  const terminal = new Set(['SUCCEEDED','FAILED','NEEDS_INPUT','NEEDS_REVIEW','INTERRUPTED']);
  return previous !== null && jobs.some(job => terminal.has(job.status) &&
    (!previous.has(job.id) || ACTIVE_IMPORT_JOB_STATUSES.has(previous.get(job.id))));
}

/** Download only owner-authenticated retained artifacts, never arbitrary result URLs. */
export function reviewJobArtifacts(result) {
  return (Array.isArray(result?.artifacts) ? result.artifacts : []).filter(file =>
    file && typeof file.name === 'string' && typeof file.downloadUrl === 'string' &&
    /^\/api\/desk\/portal-import\/artifacts\/[A-Za-z0-9_-]+$/.test(file.downloadUrl));
}
