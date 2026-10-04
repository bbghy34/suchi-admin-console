'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AlarmClock, ArrowUpRight, Bookmark, CalendarClock, CalendarCheck, Landmark } from 'lucide-react';

/** Counts up from 0 once on mount; shows the final value when motion is reduced. */
function CountUp({ value }) {
  const [shown, setShown] = useState(value);
  useEffect(() => {
    if (!value || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setShown(value);
      return undefined;
    }
    let frame;
    const start = performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - start) / 700);
      setShown(Math.round(value * (1 - (1 - t) ** 3)));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);
  return <span className="tabular-nums">{shown}</span>;
}

function Tile({ icon: Icon, label, value, hint, tone = 'accent', href, delay, children }) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-mat-dim">{label}</span>
        <span className={`grid h-7 w-7 place-items-center rounded-lg d-badge-${tone}`}><Icon size={14} aria-hidden="true" /></span>
      </div>
      <p className="mt-2 text-[28px] font-semibold leading-8 tracking-tight text-mat-on"><CountUp value={value} /></p>
      {children}
      <p className="mt-1 truncate text-xs text-mat-dim">{hint}</p>
      {href ? <ArrowUpRight size={14} aria-hidden="true" className="absolute bottom-3 right-3 text-mat-dim opacity-0 transition-opacity group-hover:opacity-100" /> : null}
    </>
  );
  const cls = 'd-card d-card-hover d-spot d-rise group relative block p-4';
  const style = { animationDelay: `${delay}ms` };
  return href ? <Link href={href} className={cls} style={style}>{body}</Link> : <div className={cls} style={style}>{body}</div>;
}

export function DashboardStats({ in3, in7, saved, held, fetch, streak }) {
  const done = Math.max(0, (fetch.total || 0) - (fetch.open || 0));
  const pct = fetch.total ? Math.round((done / fetch.total) * 100) : 0;
  function spotlight(e) {
    const card = e.target.closest?.('.d-spot');
    if (!card) return;
    const box = card.getBoundingClientRect();
    card.style.setProperty('--mx', `${e.clientX - box.left}px`);
    card.style.setProperty('--my', `${e.clientY - box.top}px`);
  }
  return (
    <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5" onMouseMove={spotlight}>
      <Tile icon={AlarmClock} label="Closing in 3 days" value={in3} tone={in3 ? 'danger' : 'neutral'} hint={in3 ? 'Needs attention now' : 'Nothing urgent'} delay={0} href="#reminders" />
      <Tile icon={CalendarClock} label="Closing in 4–7 days" value={in7} tone={in7 ? 'warn' : 'neutral'} hint="Plan the bid papers" delay={60} href="#reminders" />
      <Tile icon={Bookmark} label="Saved tenders" value={saved} hint="On your reminder board" delay={120} href="/tenders/desk/my-tenders" />
      <Tile icon={Landmark} label="Security held" value={held} tone={held ? 'warn' : 'ok'} hint={held ? 'Deposits still with departments' : 'Nothing held'} delay={180} href="/tenders/desk/money" />
      <Tile
        icon={CalendarCheck}
        label="Portal review"
        value={done}
        tone={fetch.complete ? 'ok' : 'accent'}
        hint={fetch.complete ? `Finished · ${streak} day streak` : `${fetch.open} to review · ${fetch.assignee?.name || 'Unassigned'}`}
        delay={240}
        href={fetch.isFetcher ? '/tenders/desk/fetch' : undefined}
      >
        <div className="mt-2 flex items-center gap-2">
          <div className="d-bar flex-1"><span style={{ width: `${fetch.complete ? 100 : pct}%` }} /></div>
          <span className="text-[11px] tabular-nums text-mat-dim">{done}/{fetch.total || 0}</span>
        </div>
      </Tile>
    </div>
  );
}
