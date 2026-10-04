export const IMPORT_STAGES = ['find','captcha','download','save'];
/** Attempts come from actual solver events, never from elapsed time or estimates. */
export function describeImportStage(message, previous = {}) {
  const text = String(message || '');
  let stage = IMPORT_STAGES.includes(previous.stage) ? previous.stage : 'find';
  if (/\b(saving|sav(?:e|ed) (?:files|documents)|extract(?:ing|ion)?|reading (?:the )?(?:downloaded|pdf|document|file))/i.test(text)) stage = 'save';
  else if (/captcha/i.test(text)) stage = 'captcha';
  else if (/download(?:ing)?|retrieving (?:official )?(?:files|documents)/i.test(text)) stage = 'download';
  else if (/find(?:ing)?|search(?:ing)?|resolv(?:e|ing)|opening.*notice|checking saved/i.test(text)) stage = 'find';
  const attempt = text.match(/(?:challenge|attempt)\s*(?:#|:)?\s*(\d+)/i);
  const captchaAttempt = attempt && /captcha/i.test(text) ? Number(attempt[1]) : previous.captchaAttempt ?? null;
  return {stage,captchaAttempt:Number.isInteger(captchaAttempt)&&captchaAttempt>0 ? captchaAttempt : null};
}
export function recordImportStage(job, event, at) {
  if (!event) return {};
  const data = typeof event === 'string' ? {message:event} : event;
  const inferred=describeImportStage(data.message,job);
  const stage=IMPORT_STAGES.includes(data.stage)?data.stage:inferred.stage;
  const captchaAttempt=Number.isInteger(data.captchaAttempt)&&data.captchaAttempt>0?data.captchaAttempt:inferred.captchaAttempt;
  const history=Array.isArray(job.stageHistory)?job.stageHistory:[];
  const entry={stage,captchaAttempt,message:String(data.message||job.progressMessage||'').slice(0,1000),at};
  const last=history.at(-1);
  return {stage,captchaAttempt,stageHistory:last&&last.stage===entry.stage&&last.captchaAttempt===entry.captchaAttempt?history:[...history,entry].slice(-24)};
}
export function importStageItems(job) {
  const result=job.resultJSON||job.result||{};
  const history=job.stageHistory||[];
  const seen=new Set(history.map(x=>x.stage));
  if(job.stage)seen.add(job.stage);
  const active=['RUNNING'].includes(job.status), success=['SUCCEEDED','NEEDS_REVIEW'].includes(job.status);
  return IMPORT_STAGES.map(stage=>({stage,label:{find:'Find',captcha:'CAPTCHA',download:'Download',save:'Save'}[stage],
    state:active&&job.stage===stage?'active':seen.has(stage)?(!success&&job.stage===stage&&!active?'stopped':'done'):success?(stage==='captcha'?'skipped':result.existing?'reused':'unobserved'):'pending',
    attempt:stage==='captcha'?job.captchaAttempt:null,
  }));
}
