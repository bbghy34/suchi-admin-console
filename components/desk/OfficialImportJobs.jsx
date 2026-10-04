"use client";

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, ArrowRight, Bell, CheckCircle2, Clock, Download, FileSearch, Loader2, RefreshCw, XCircle } from 'lucide-react';
import { ImportStageTrack } from './ImportStageTrack';
import { downloadFailureGuide } from '@/lib/desk/portal-import/failure-guide.mjs';
import { clearSearchCache } from './search-cache';
import { ACTIVE_IMPORT_JOB_STATUSES, importJobBody, importJobResult, readJobResponse, importJobRetryTime, statusPollError, importJobsCompletedSince, reviewJobArtifacts } from '@/lib/desk/portal-import/jobs-client.mjs';

const LABELS={QUEUED:'Queued',RUNNING:'Retrieving official files',SUCCEEDED:'Tender saved',FAILED:'Download needs attention',INTERRUPTED:'Download interrupted',NEEDS_INPUT:'Choose the official notice',NEEDS_REVIEW:'Files saved — details need review'};
const active=job=>ACTIVE_IMPORT_JOB_STATUSES.has(job?.status);
/** Colour and icon for each job state; the words stay in LABELS. */
const TONE={QUEUED:['waiting',Clock],RUNNING:['running',Loader2],SUCCEEDED:['saved',CheckCircle2],NEEDS_REVIEW:['review',FileSearch],NEEDS_INPUT:['review',FileSearch],FAILED:['failed',XCircle],INTERRUPTED:['failed',AlertTriangle]};
export const jobTone=job=>(TONE[job?.status]||['waiting',Clock])[0];
function JobBadge({job}){
  const [tone,Icon]=TONE[job.status]||['waiting',Clock];
  return <span className="d-job-badge" data-tone={tone}><Icon size={13} className={job.status==='RUNNING'?'animate-spin':''} aria-hidden="true"/>{LABELS[job.status] || 'Checking download'}</span>;
}
const elapsedText=ms=>ms>=60000?`${Math.floor(ms/60000)}m ${Math.floor(ms/1000)%60}s`:`${Math.floor(ms/1000)}s`;

/** Pause polling in hidden tabs; resume immediately when the user comes back. */
function useVisiblePolling(callback, enabled, intervalMs=3000) {
  const latest=useRef(callback);
  useEffect(()=>{latest.current=callback;},[callback]);
  useEffect(()=>{
    if(!enabled)return;
    let timer, stopped=false, controller, running=false;
    const tick=async()=>{
      if(stopped || document.hidden || running)return;
      running=true;
      controller=new AbortController();
      const timeout=setTimeout(()=>controller.abort(new DOMException('Checking status timed out','TimeoutError')),20000);
      try{await latest.current(controller.signal);}catch{/* Caller displays a retryable status error. */}
      finally{clearTimeout(timeout);running=false;controller=null;if(!stopped&&!document.hidden)timer=setTimeout(tick,intervalMs);}
    };
    const visible=()=>{clearTimeout(timer);if(document.hidden)controller?.abort();else void tick();};
    // Mark a completed request as available for immediate visibility refresh.
    const start=()=>void tick();
    start();document.addEventListener('visibilitychange',visible);
    return()=>{stopped=true;clearTimeout(timer);controller?.abort();document.removeEventListener('visibilitychange',visible);};
  },[enabled,intervalMs]);
}
/** The worker's own progress messages, newest first: real steps, never invented ones. */
function LiveSteps({job}){
  const seen=new Set();
  const steps=[...(job.stageHistory||[])].reverse().filter(step=>{const text=String(step.message||'').trim();if(!text||seen.has(text))return false;seen.add(text);return true;}).slice(0,4);
  if(!steps.length)return null;
  return <ul className="d-live" aria-label="Latest download steps">
    {steps.map((step,index)=><li key={`${step.at}-${index}`} data-current={index===0?'true':undefined}>
      <span className="d-live-dot" aria-hidden="true"/>
      <span className="min-w-0 flex-1">{step.message}</span>
      {step.at?<time className="shrink-0 tabular-nums" dateTime={step.at}>{new Date(step.at).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',second:'2-digit',timeZone:'Asia/Kolkata'})}</time>:null}
    </li>)}
  </ul>;
}

/** What one click did, once the files are saved. */
function DoneSummary({job,result,elapsed}){
  const files=Number(result?.documentCount ?? result?.savedDocuments?.length ?? result?.artifacts?.length);
  const captchas=Number(job.captchaAttempt);
  const bits=[];
  if(Number.isFinite(files)&&files>0)bits.push(`${files} official file${files===1?'':'s'} saved`);
  if(result?.existing)bits.push('Reused files already on the desk');
  if(Number.isFinite(captchas)&&captchas>0)bits.push(`${captchas} portal CAPTCHA${captchas===1?'':'s'} solved`);
  if(Number.isFinite(elapsed)&&elapsed>0)bits.push(`done in ${elapsedText(elapsed)}`);
  if(!bits.length)return null;
  return <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-mat-muted">{bits.map(bit=><span key={bit} className="inline-flex items-center gap-1"><CheckCircle2 size={12} className="text-emerald-400" aria-hidden="true"/>{bit}</span>)}</p>;
}

/** What went wrong and what to do next, for a download that did not finish. */
function FailurePanel({guide,job,sourceLink,detail,onRetry,pending,retryTime}){
  const link=sourceLink||job.sourceLink;
  const search=job.title||job.query;
  const tone=guide.retry?'review':'failed';
  return <div className="space-y-3 rounded-xl p-3.5" style={{background:tone==='failed'?'rgba(239,83,80,0.07)':'rgba(251,191,36,0.07)',border:`1px solid ${tone==='failed'?'rgba(239,83,80,0.28)':'rgba(251,191,36,0.28)'}`}}>
    <div className="flex items-start gap-2.5">
      {tone==='failed'?<XCircle size={16} className="mt-0.5 shrink-0 text-red-400" aria-hidden="true"/>:<AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-300" aria-hidden="true"/>}
      <div className="min-w-0">
        <p className="text-sm font-semibold text-mat-on">{guide.title}</p>
        <p className="mt-0.5 text-xs leading-5 text-mat-muted">{guide.detail}</p>
        {detail?<p className="mt-1.5 text-[11px] leading-4 text-mat-dim">Portal said: {detail}</p>:null}
      </div>
    </div>
    <div className="flex flex-wrap gap-2">
      {guide.retry&&onRetry?<button type="button" disabled={pending||!!retryTime||job.canRetry===false} className="d-btn d-btn-primary text-sm disabled:opacity-50" onClick={onRetry}><RefreshCw size={14} aria-hidden="true"/>{retryTime?'Retry when the wait is over':'Try again'}</button>:null}
      {guide.actions.includes('search')&&search?<a className="d-btn d-btn-outline text-sm" href={`/tenders/desk/search?q=${encodeURIComponent(search)}`}><FileSearch size={14} aria-hidden="true"/>Search again</a>:null}
      {guide.actions.includes('notice')&&link?<a className="d-btn d-btn-outline text-sm" href={link} target="_blank" rel="noreferrer">Open official notice <ArrowRight size={14} aria-hidden="true"/></a>:null}
      {guide.actions.includes('upload')?<a className="d-btn d-btn-ghost text-sm" href="/tenders/desk/tenders/new"><Download size={14} aria-hidden="true"/>Upload files you have</a>:null}
    </div>
  </div>;
}

export function OfficialImportJobStatus({job,returnTo,onNeedsChoice,onChoose,onRetry,pending=false,sourceLink}) {
  const result=importJobResult(job);
  const elapsed=Number(job.elapsedMs ?? result?.elapsedMs);
  const message=job.progressMessage || job.message || job.progress?.message;
  const error=typeof job.error==='string'?job.error:job.error?.message;
  const tenderId=result?.tenderId;
  const [now,setNow]=useState(Date.now);
  const retryTime=importJobRetryTime(job,now);
  const guide=downloadFailureGuide(job,result);
  useEffect(()=>{if(!retryTime)return;const timer=setTimeout(()=>setNow(Date.now()),Math.min(2147483647,Math.max(1,retryTime-Date.now()+50)));return()=>clearTimeout(timer);},[retryTime]);
  return <div className="mt-3 space-y-3 text-sm">
    <p role="status" className="flex flex-wrap items-center gap-2 text-mat-on">
      <JobBadge job={job}/>
      {Number.isFinite(elapsed)&&elapsed>0?<span className="inline-flex items-center gap-1 text-xs tabular-nums text-mat-dim"><Clock size={12} aria-hidden="true"/>{elapsedText(elapsed)}{active(job)?' so far':' in total'}</span>:null}
    </p>
    {active(job)?<div className="d-progress" role="progressbar" aria-label="Retrieving official files" aria-valuetext={LABELS[job.status]}/>:null}
    <ImportStageTrack stage={job.stage} captchaAttempt={job.captchaAttempt} history={job.stageHistory} status={job.status} result={result}/>
    {active(job)?<LiveSteps job={job}/>:null}
    {['SUCCEEDED','NEEDS_REVIEW'].includes(job.status)?<DoneSummary job={job} result={result} elapsed={elapsed}/>:null}
    {message && message !== error && !result?.needsChoice?<p className="text-xs text-mat-muted">{message}</p>:null}
    {active(job)?<p className="flex items-start gap-2 text-xs text-mat-dim"><Bell size={14} className="shrink-0" aria-hidden="true"/>You can leave this page. Check your Tender Desk notifications for the result.</p>:null}
    {guide?<FailurePanel guide={guide} job={job} sourceLink={sourceLink} detail={error} onRetry={onRetry} pending={pending} retryTime={retryTime}/>:error?<p role="alert" className="text-xs text-mat-on">{error}</p>:null}
    {result?.needsChoice?<div className="space-y-2"><p className="text-xs text-mat-muted">{result.message || 'More than one official notice matches. Choose the correct notice before downloading.'}</p>{onChoose&&result.matches?.length?<div className="space-y-2">{result.matches.map((match,i)=><button type="button" disabled={pending} key={`${match.sourceId}:${match.tenderId}:${i}`} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm disabled:opacity-50 d-btn d-btn-outline block w-full text-left" onClick={()=>onChoose(match)}><span className="block">{match.title}</span><span className="block text-xs text-mat-dim">{match.portal} · {match.tenderId || match.reference}</span></button>)}</div>:onNeedsChoice?<button type="button" className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm disabled:opacity-50 d-btn d-btn-outline" onClick={()=>onNeedsChoice(result)}>Choose official notice</button>:<a className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm disabled:opacity-50 d-btn d-btn-outline" href={returnTo && returnTo !== '/tenders/desk/jobs' ? returnTo : '/tenders/desk/search'}>Return to search</a>}</div>:null}
    {job.status==='NEEDS_REVIEW'?<div className="space-y-2 rounded border border-[var(--md-border)] p-3">
      <p className="text-xs text-mat-muted">The original files are saved. Some tender details could not be verified automatically. Review the files, then complete manual intake.</p>
      <ul className="space-y-1">{reviewJobArtifacts(result).map(file=><li key={file.id}><a className="inline-flex items-center gap-2 text-xs underline" href={file.downloadUrl}><Download size={13} aria-hidden="true"/>{file.name}</a></li>)}</ul>
      <a className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm d-btn d-btn-outline" href="/tenders/desk/tenders/new">Complete tender details <ArrowRight size={14} aria-hidden="true"/></a>
    </div>:null}
    {tenderId?<a className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm disabled:opacity-50 d-btn d-btn-primary" href={`/tenders/desk/tenders/${encodeURIComponent(tenderId)}${returnTo?`?from=${encodeURIComponent(returnTo)}`:''}`}>Saved · Open tender <ArrowRight size={14} aria-hidden="true"/></a>:null}
    {retryTime?<p className="text-xs text-mat-dim">The official portal asked us to wait. Retry after {new Date(retryTime).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'})} IST.</p>:null}

    {result?.downloadWarnings?.length?<p className="text-xs text-mat-dim">Some official attachments could not be retrieved. Open the tender to review the saved files and warnings.</p>:null}
    {result?.extractionWarnings?.length?<p className="text-xs text-mat-dim">Original files were saved. Some files need manual text review.</p>:null}
  </div>;
}

/** Keep package/title evidence when confirming a corrected notice, including choices without an ID. */
export function selectedNoticePayload(match, original={}) {
  return {
    row: {
      title: original.row?.title || match.title,
      link: match.officialLink,
      detail: String(match.evidence || original.row?.detail || '').slice(0,12000),
      portalTenderId: match.tenderId,
      reference: match.reference,
      documents: [],
    },
    query: original.query || '',
  };
}

/** The single retrieval action always runs as a persistent job. */
export function OfficialImportJobs({payload,disabled=false,returnTo,onQueued,onNeedsChoice}) {
  const [job,setJob]=useState(null),[pending,setPending]=useState(false),[error,setError]=useState('');
  const submitting=useRef(false), mounted=useRef(true);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  const refresh=useCallback(async signal=>{
    if(!job?.id)return;
    try{const data=await readJobResponse(await fetch(`/api/desk/portal-import/jobs/${encodeURIComponent(job.id)}`,{credentials:'same-origin',cache:'no-store',signal}));if(!signal?.aborted&&mounted.current){setJob(data.job || data);setError('');}}
    catch(err){const message=statusPollError(err,signal);if(message&&mounted.current)setError(`${message} The job may still be running; check notifications before retrying.`);}
  },[job?.id]);
  useVisiblePolling(refresh,active(job));
  useEffect(()=>{if(job?.status==='SUCCEEDED'||job?.status==='NEEDS_REVIEW')clearSearchCache();},[job?.status]);
  async function start(nextPayload=payload,retryId=null){
    if(submitting.current||disabled||active(job))return;
    submitting.current=true;setPending(true);setError('');
    try{
      const body=retryId?undefined:importJobBody(nextPayload);
      const data=await readJobResponse(await fetch(retryId?`/api/desk/portal-import/jobs/${encodeURIComponent(retryId)}/retry`:'/api/desk/portal-import/jobs',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body,signal:AbortSignal.timeout(60000)}));
      const next=data.job || data;
      if(!next?.id)throw new Error('The server did not return a download reference. Check background downloads before trying again.');
      if(mounted.current){setJob(next);onQueued?.(next);}
    }catch(err){if(mounted.current)setError(['TimeoutError','AbortError'].includes(err.name)?'The queue response took too long. Check background downloads before retrying; your job may already be queued.':err.message);}
    finally{submitting.current=false;if(mounted.current)setPending(false);}
  }
  return <div>
    {!job ? <button type="button" className="d-btn d-btn-primary" disabled={disabled||pending} aria-busy={pending} onClick={()=>start()}>
      {pending?<Loader2 size={15} className="animate-spin" aria-hidden="true"/>:<Download size={15} aria-hidden="true"/>}
      {pending?'Starting download…':'Save tender & files'}
    </button> : null}
    {!job && !disabled ? <p className="mt-2 text-xs text-mat-dim">Saves the tender and original files to Tender Desk. Already saved files are reused. You can leave this page; we’ll notify you when it finishes.</p> : null}
    {job?<OfficialImportJobStatus job={job} sourceLink={payload?.row?.link || payload?.link} returnTo={returnTo} onNeedsChoice={onNeedsChoice} pending={pending} onRetry={()=>start(undefined,job.id)} onChoose={match=>start(selectedNoticePayload(match,payload))}/>:null}
    {job ? <a className="mt-3 inline-block text-xs text-mat-dim underline" href="/tenders/desk/jobs">View downloads</a> : null}
    {error?<p role="alert" className="mt-2 text-xs text-mat-on">{error}</p>:null}
  </div>;
}

/** Optional small panel on an existing Desk page; only the current user's jobs. */
export function OfficialImportJobsList({returnTo}) {
  const [jobs,setJobs]=useState([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[pendingId,setPendingId]=useState(null),[tab,setTab]=useState('all');
  const actionPending=useRef(false), mounted=useRef(true);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  const refresh=useCallback(async signal=>{
    try{const data=await readJobResponse(await fetch('/api/desk/portal-import/jobs',{credentials:'same-origin',cache:'no-store',signal}));if(!signal?.aborted&&mounted.current){setJobs(Array.isArray(data.jobs)?data.jobs:[]);setError('');}}
    catch(err){const message=statusPollError(err,signal);if(message&&mounted.current)setError(message);}finally{if((!signal?.aborted||signal.reason?.name==='TimeoutError')&&mounted.current)setLoading(false);}
  },[]);
  useVisiblePolling(refresh,loading||jobs.some(active));
  async function act(job,choice){
    if(actionPending.current)return;actionPending.current=true;setPendingId(job.id);setError('');
    try{
      const url=choice?'/api/desk/portal-import/jobs':`/api/desk/portal-import/jobs/${encodeURIComponent(job.id)}/retry`;
      const body=choice?importJobBody(selectedNoticePayload(choice,{row:{title:job.title},query:job.query})):undefined;
      await readJobResponse(await fetch(url,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body,signal:AbortSignal.timeout(60000)}));
      if(mounted.current)await refresh(AbortSignal.timeout(20000));
    }catch(err){if(mounted.current)setError(['TimeoutError','AbortError'].includes(err.name)?'The response took too long. Refresh this list before retrying; the job may already be queued.':err.message);}
    finally{actionPending.current=false;if(mounted.current)setPendingId(null);}
  }
  // One card per tender: the newest attempt, with older attempts counted under it.
  const tenderKey=job=>String(importJobResult(job)?.tenderId||job.title||job.query||job.id).trim().toLowerCase();
  const latest=new Map();
  for(const job of jobs){const key=tenderKey(job);const seen=latest.get(key);
    if(!seen)latest.set(key,{job,earlier:0});
    else if(Date.parse(job.createdAt||0)>Date.parse(seen.job.createdAt||0))latest.set(key,{job,earlier:seen.earlier+1});
    else seen.earlier+=1;}
  const groups=[...latest.values()];
  const bucket=job=>{const tone=jobTone(job);return tone==='running'||tone==='waiting'?'running':tone==='saved'?'saved':'attention';};
  const counts={running:0,saved:0,attention:0};
  for(const {job} of groups)counts[bucket(job)]+=1;
  // Running jobs first, then the ones that need you, then finished ones; newest first inside each.
  const rank={running:0,attention:1,saved:2};
  const ordered=groups.filter(({job})=>tab==='all'||bucket(job)===tab)
    .sort((a,b)=>(rank[bucket(a.job)]-rank[bucket(b.job)])||(Date.parse(b.job.createdAt||0)-Date.parse(a.job.createdAt||0)));
  const TABS=[['all','All',groups.length],['running','Running',counts.running],['attention','Needs attention',counts.attention],['saved','Saved',counts.saved]];
  return <section aria-label="Your background downloads" className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap gap-1 rounded-xl p-1" role="tablist" aria-label="Filter downloads" style={{background:'var(--md-surface2)',border:'1px solid var(--md-border)'}}>
        {TABS.map(([key,label,count])=><button key={key} type="button" role="tab" aria-selected={tab===key} onClick={()=>setTab(key)}
          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors"
          style={tab===key?{background:'var(--md-surface)',color:'var(--md-on)',boxShadow:'inset 0 0 0 1px var(--md-border-strong)'}:{color:'var(--md-muted)'}}>
          {label}<span className="rounded-full px-1.5 text-[11px] tabular-nums" style={{background:key==='attention'&&count?'rgba(251,191,36,0.18)':key==='running'&&count?'color-mix(in srgb, var(--md-primary) 20%, transparent)':'var(--md-surface2)',color:key==='attention'&&count?'#fbbf24':'var(--md-muted)'}}>{count}</span>
        </button>)}
      </div>
      <button type="button" className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm disabled:opacity-50 d-btn d-btn-ghost" disabled={loading} onClick={()=>{setLoading(true);}}><RefreshCw size={14} className={loading?'animate-spin':''} aria-hidden="true"/>Refresh</button>
    </div>
    {loading&&!jobs.length?<div role="status" className="d-job-card space-y-3"><p className="flex items-center gap-2 text-sm text-mat-muted"><Loader2 size={15} className="animate-spin" aria-hidden="true"/>Checking your downloads…</p><div className="d-progress"/></div>:null}
    {error?<p role="alert" className="rounded-xl px-4 py-3 text-sm" style={{background:'rgba(239,83,80,0.10)',border:'1px solid rgba(239,83,80,0.3)',color:'#ef9a9a'}}>{error}</p>:null}
    {!loading&&!error&&!jobs.length?<div className="d-job-card flex flex-col items-center gap-2 py-10 text-center"><Download size={28} className="text-mat-dim" aria-hidden="true"/><p className="text-sm font-medium text-mat-on">No downloads yet</p><p className="max-w-sm text-xs text-mat-dim">Search for a tender and choose “Save tender & files”. Each download shows up here with its progress.</p><a href="/tenders/desk/search" className="d-btn d-btn-outline mt-2 text-sm">Search tenders</a></div>:null}
    {!loading&&jobs.length&&!ordered.length?<p className="d-job-card py-6 text-center text-sm text-mat-dim">Nothing in this view.</p>:null}
    {ordered.map(({job,earlier})=><article className="d-job-card" data-tone={jobTone(job)} key={job.id}>
      <p className="text-sm font-semibold leading-snug text-mat-on">{job.title || job.query || `Official download ${job.id.slice(0,8)}`}</p>
      {job.query&&job.title&&job.query!==job.title?<p className="mt-0.5 truncate text-xs text-mat-dim">From search “{job.query}”</p>:null}
      {earlier?<p className="mt-0.5 text-xs text-mat-dim">{earlier} earlier attempt{earlier===1?'':'s'} for this tender</p>:null}
      <OfficialImportJobStatus job={job} returnTo={returnTo} pending={!!pendingId} onRetry={()=>act(job)} onChoose={choice=>act(job,choice)}/>
    </article>)}
  </section>;
}

/** Compact persistent entry point; polling reads our database, never government sites. */
export function OfficialImportJobsIndicator(){
  const router=useRouter(), previousStatuses=useRef(null);
  const [jobs,setJobs]=useState(null),[error,setError]=useState(false);
  const refresh=useCallback(async signal=>{
    try{const data=await readJobResponse(await fetch('/api/desk/portal-import/jobs',{credentials:'same-origin',cache:'no-store',signal}));if(!signal.aborted){setJobs(Array.isArray(data.jobs)?data.jobs:[]);setError(false);}}
    catch(err){if(statusPollError(err,signal))setError(true);}
  },[]);
  // Check often only while something runs; idle Desk tabs check once a minute.
  const anyRunning=(jobs || []).some(active);
  useVisiblePolling(refresh,true,anyRunning?10000:60000);
  useEffect(()=>{
    if(jobs===null)return;
    const completed=importJobsCompletedSince(previousStatuses.current,jobs);
    const nextStatuses=new Map(previousStatuses.current || []);
    for(const job of jobs)nextStatuses.set(job.id,job.status);
    previousStatuses.current=nextStatuses;
    // Include jobs that completed between polls, without refreshing on first load.
    if(completed)router.refresh();
  },[jobs,router]);
  const running=(jobs || []).filter(active).length;
  if (!running && !error) return null;
  return <div className="flex flex-wrap items-center gap-2 text-xs text-mat-dim">
    <a href="/tenders/desk/jobs" className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm disabled:opacity-50 d-btn d-btn-ghost"><Download size={14} aria-hidden="true"/>Downloads{running?` · ${running} running`:''}</a>
    <span role="status" aria-live="polite">{error?'Status unavailable. Open downloads to retry.':running?'You can keep working while files are retrieved.':''}</span>
  </div>;
}
