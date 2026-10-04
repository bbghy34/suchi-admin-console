import { chooseDefaultOfficialNotice } from './default-choice.mjs';
import { prisma } from '@/lib/prisma';
import { isActiveAccount } from '@/lib/security';
import { decoratePerson, personRoles, rolesForConsole } from '@/lib/desk/auth';
import { runImport } from './service';
import { claimJob, heartbeatJob, finishJob } from './jobs.mjs';

/** Time a portal download needs after waiting for a session (two CAPTCHAs plus files). */
const PORTAL_WORK_MS = 150000;

/** Reload current permissions; a job never stores a session cookie or API key. */
async function jobActor(db, ownerId) {
  const person = await db.person.findUnique({ where: { id: ownerId } });
  const employee = person?.employeeId ? await db.employee.findUnique({ where: { id: person.employeeId } }) : null;
  if (!employee || !isActiveAccount(employee)) throw new Error('Your account can no longer retrieve official files.');
  const ceiling = rolesForConsole(employee.role).split(',');
  return decoratePerson({ ...person, roles: personRoles(person).filter(role => ceiling.includes(role)).join(',') });
}

/** Invoked through Next after(): browser navigation does not cancel this work. */
export async function executeImportJob(id, { db = prisma, run = runImport, heartbeatMs = 15000, complete = finishJob, completionRetryMs = 500, portalWaitMs = 180000, portalPollMs = 10000, now = Date.now, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {}) {
  const job = await claimJob(db, id);
  if (!job) return;
  let writes = Promise.resolve();
  const persistProgress = event => {
    writes = writes.then(() => heartbeatJob(db, id, job.claimToken, event)).catch(() => {
      console.error('portal_job', { jobId: id, event: 'progress_persistence_failed' });
    });
  };
  const heartbeat = setInterval(() => persistProgress(), heartbeatMs);
  let result;
  try {
    let actor = await jobActor(db, job.ownerId);
    const deadlineAt = now() + 270000;
    let queuedMs = 0;
    let payload = job.payload;
    const tried = new Set();
    for (let attempt=0; attempt<3; attempt++) {
      for (;;) {
        const request = new Request('http://localhost/api/desk/portal-import', {
          method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),
        });
        const response = await run(request,event=>persistProgress(event),{actor,requestId:id,deadlineAt});
        result = await response.json();
        if (!response.ok) result.ok = false;
        // Only an unacquired session can be retried automatically. A failed
        // download or CAPTCHA may already have incurred costs and is final.
        if (response.status !== 429 || !['PORTAL_BUSY', 'PORTAL_COOLDOWN'].includes(result.code)) break;
        const retryAt = Number(result.retryAt) || Date.parse(result.retryAt) || now() + portalPollMs;
        const delay = Math.max(portalPollMs, retryAt - now());
        // A portal download can need two paid CAPTCHAs at up to two minutes each.
        // Starting with less time left would spend on solves that cannot finish.
        if (queuedMs + delay > portalWaitMs || now() + delay > deadlineAt - PORTAL_WORK_MS) {
          result = {...result, retryAt: Math.max(retryAt, now() + portalPollMs),
            error:result.code === 'PORTAL_COOLDOWN'
              ? 'The portal is still cooling down. Please retry after the indicated time.'
              : 'This portal is still busy. Please retry after the current downloads finish.'};
          break;
        }
        persistProgress({stage:'find',message:result.code === 'PORTAL_COOLDOWN'
          ? 'The portal asked us to pause. Your download will start automatically after its cooldown; you can leave this page.'
          : 'Waiting for an available portal session. Your download will start automatically; you can leave this page.'});
        await sleep(delay);
        queuedMs += delay;
        // Do not restart work after cancellation, a lost claim or revoked access.
        await writes;
        let stillOwned = await heartbeatJob(db, id, job.claimToken);
        // A simultaneous progress heartbeat can win the first CAS. Re-read once.
        if (!stillOwned) {
          await writes;
          stillOwned = await heartbeatJob(db, id, job.claimToken);
        }
        if (!stillOwned) {
          result = {ok:false,error:'This download job is no longer active.',requestId:id};
          break;
        }
        actor = await jobActor(db, job.ownerId);
      }
      if (!result.needsChoice) break;
      const selected = chooseDefaultOfficialNotice(job.payload.row || job.payload,result.matches || []);
      const candidate = selected?.candidate;
      const key = candidate && `${candidate.officialLink}:${candidate.tenderId || candidate.reference || ''}`;
      if (!candidate || tried.has(key) || attempt===2 || now()>=deadlineAt) {
        result = {ok:false,code:'NO_VERIFIED_MATCH',error:'A matching official source could not be verified automatically. No unrelated tender was saved.',requestId:id};
        break;
      }
      tried.add(key);
      persistProgress({stage:'find',message:'Finding the matching official copy automatically…'});
      payload = {query:job.payload.query || '',row:{
        title:job.payload.row?.title || candidate.title || '',link:candidate.officialLink,
        portalTenderId:candidate.tenderId || '',reference:candidate.reference || '',
        detail:candidate.evidence || candidate.title || '',
      }};
    }
  } catch (error) {
    console.error('portal_job', { jobId: id, event: 'worker_failed', type: error.name });
    result = { ok: false, error: 'This background retrieval could not finish. Check your saved tenders before retrying.', requestId: id };
  } finally {
    clearInterval(heartbeat);
    await writes;
  }
  // Retry only the database completion write, never the paid retrieval.
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const finished = await complete(db, id, job.claimToken, result);
      console.info('portal_job', { jobId: id, event: finished ? 'finished' : 'completion_fenced', status: finished?.status || null });
      return finished;
    } catch (error) {
      console.error('portal_job', { jobId: id, event: 'completion_persistence_failed', attempt: attempt + 1, type: error.name });
      if (attempt < 2) await new Promise(resolve => setTimeout(resolve, completionRetryMs * (attempt + 1)));
    }
  }
  // Persisted heartbeat allows polling to report interruption if the DB stays down.
  return null;
}
