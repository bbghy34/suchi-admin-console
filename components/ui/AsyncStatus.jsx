'use client';
import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';

/** Indeterminate unless the caller supplies a measured completed/total pair. */
export default function AsyncStatus({ message = 'Loading records…', description = 'Retrieving the latest saved information.', completed, total, compact = false }) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => { const start=Date.now(); const timer=setInterval(()=>setSeconds(Math.floor((Date.now()-start)/1000)),1000); return ()=>clearInterval(timer); }, []);
  const measured = Number.isFinite(total) && total > 0 && Number.isFinite(completed);
  const percent = measured ? Math.max(0, Math.min(100, completed / total * 100)) : undefined;
  return <div className={compact ? 'w-full py-2' : 'mx-auto w-full max-w-md py-6'} aria-busy="true">
    <div className="flex items-start gap-3">
      <Loader2 className="mt-0.5 h-5 w-5 shrink-0 animate-spin motion-reduce:animate-none" style={{color:'var(--md-primary)'}} aria-hidden="true" />
      <div className="min-w-0 flex-1" role="status" aria-live="polite">
        <p className="text-sm font-semibold" style={{color:'var(--md-on)'}}>{message}</p>
        {description ? <p className="mt-1 text-xs leading-5" style={{color:'var(--md-muted)'}}>{description}</p> : null}
        {seconds >= 20 ? <p className="mt-2 text-xs" style={{color:'var(--md-muted)'}}>Taking longer than usual. Keep this page open; avoid submitting the same action again.</p> : null}
      </div>
      <span className="text-xs tabular-nums" style={{color:'var(--md-dim)'}} aria-label="Elapsed time">{seconds}s</span>
    </div>
    <div role="progressbar" aria-label={message} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} className="mt-3 h-1.5 overflow-hidden rounded-full" style={{background:'var(--md-surface3)'}}>
      <div className={measured ? 'h-full rounded-full transition-all' : 'console-progress-bar h-full rounded-full'} style={{background:'var(--md-primary)',width:measured ? `${percent}%` : '35%'}} />
    </div>
  </div>;
}
