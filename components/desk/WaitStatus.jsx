'use client';
import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';

export function WaitStatus({ title, detail, slow = 'This is taking longer than usual. Please keep this page open.', className = '' }) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const start = Date.now();
    const timer = setInterval(() => setSeconds(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(timer);
  }, []);
  return <div className={`d-card overflow-hidden p-4 ${className}`}>
    <div className="flex items-start gap-3">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[var(--d-accent-soft)]"><Loader2 aria-hidden="true" size={16} className="animate-spin text-[var(--md-primary-hover)]" /></span>
      <div className="min-w-0 flex-1" role="status" aria-live="polite">
        <p className="text-sm font-semibold text-mat-on">{title}</p>
        <p className="mt-0.5 text-sm leading-6 text-mat-muted">{detail}</p>
        {seconds >= 45 ? <p className="mt-2 text-xs text-ink-600">{slow}</p> : null}
      </div>
      <span className="d-kbd shrink-0 tabular-nums" aria-label="Elapsed time">{seconds >= 60 ? `${Math.floor(seconds / 60)}m ${seconds % 60}s` : `${seconds}s`}</span>
    </div>
  </div>;
}
