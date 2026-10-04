'use client';

import { useEffect, useState } from 'react';
import { CalendarClock, CalendarDays, FileText, Gavel, Megaphone, Users } from 'lucide-react';
import { formatIST } from '@/lib/desk/format';

const MILESTONES = [
  { key: 'publishedAt', label: 'Published', icon: Megaphone },
  { key: 'preBidAt', label: 'Pre-bid meeting', icon: Users },
  { key: 'docSaleEnd', label: 'Documents close', icon: FileText },
  { key: 'bidSubmissionEnd', label: 'Bid closes', icon: CalendarClock, deadline: true },
  { key: 'bidOpeningAt', label: 'Bid opening', icon: Gavel },
];

/** "3 days 4 h", "5 h 20 min", "12 min"; null once the time has passed. */
function timeLeft(ms) {
  if (!(ms > 0)) return null;
  const minutes = Math.floor(ms / 60000);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  if (days >= 1) return `${days} day${days === 1 ? '' : 's'}${hours ? ` ${hours} h` : ''}`;
  if (hours >= 1) return `${hours} h ${minutes % 60} min`;
  return `${Math.max(1, minutes)} min`;
}

/**
 * The tender's dates as one timeline: passed milestones are ticked, the next
 * one is highlighted, and the bid deadline carries a live countdown.
 */
export function TenderDates({ tender }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);

  const items = MILESTONES
    .map((m) => ({ ...m, at: tender?.[m.key] ? Date.parse(tender[m.key]) : NaN }))
    .filter((m) => Number.isFinite(m.at))
    .sort((a, b) => a.at - b.at);
  if (!items.length) return null;

  const next = items.find((m) => m.at > now);
  const deadline = items.find((m) => m.deadline);
  const left = deadline ? timeLeft(deadline.at - now) : null;
  const urgent = deadline && deadline.at - now > 0 && deadline.at - now < 3 * 86400000;

  return (
    <section className="d-dates" aria-label="Tender dates">
      <div className="d-dates-head">
        <span className="inline-flex items-center gap-2 text-sm font-semibold text-mat-on">
          <CalendarDays size={15} aria-hidden="true" /> Key dates
        </span>
        {deadline ? (
          <span className="d-dates-countdown" data-urgent={urgent ? 'true' : undefined} data-closed={left ? undefined : 'true'}>
            {left ? `Bid closes in ${left}` : 'Bid submission closed'}
          </span>
        ) : null}
      </div>
      <ol className="d-dates-track">
        {items.map((m) => {
          const state = m.at <= now ? 'past' : m === next ? 'next' : 'later';
          const Icon = m.icon;
          return (
            <li key={m.key} className="d-dates-item" data-state={state} data-deadline={m.deadline ? 'true' : undefined}>
              <span className="d-dates-dot" aria-hidden="true"><Icon size={13} /></span>
              <span className="d-dates-label">{m.label}</span>
              <span className="d-dates-when">{formatIST(m.at, { withZone: false })}</span>
              {state === 'next' && !m.deadline ? <span className="d-dates-tag">Next · in {timeLeft(m.at - now)}</span> : null}
              {state === 'past' ? <span className="d-dates-tag" data-muted="true">Done</span> : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
