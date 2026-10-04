import Link from 'next/link';
import { ChevronDown } from 'lucide-react';
import { formatINR, relativeDays } from '@/lib/desk/format';
import { CentralBadge, SampleBadge, StageBadge } from './ui';

const BANDS = [
  { key: 'in3', title: 'Closing within 3 days', tone: 'remind-urgent', empty: 'No saved tender closes in the next 3 days.' },
  { key: 'in7', title: 'Closing within 7 days', tone: 'remind-soon', empty: 'No saved tender closes in 4 to 7 days.' },
  { key: 'ago', title: 'Ended in the last 7 days', tone: 'remind-past', empty: 'Nothing you saved ended in the last 7 days.' },
];

export function ReminderList({ reminders }) {
  const in3 = reminders?.in3 || [];
  const in7 = reminders?.in7 || [];
  const ago = reminders?.ago || [];
  const saved = reminders?.saved || [];
  const attention = in3.length + in7.length + ago.length;
  const important = [...in3, ...in7, ...ago, ...saved].filter((r) => r.important).length;

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-mat-on">Reminder board</h2>
          <p className="mt-0.5 text-xs text-mat-dim">
            {important} important {important === 1 ? 'tender' : 'tenders'} saved{attention ? ` · ${attention} with a date reminder` : ''}. Open document lines and eligibility criteria are flagged on each one.
          </p>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        {BANDS.map((band, i) => (
          <Band key={band.key} index={i} title={band.title} tone={band.tone} empty={band.empty} rows={reminders?.[band.key] || []} />
        ))}
      </div>

      <div className="d-card d-rise p-4" style={{ animationDelay: '200ms' }}>
        <h3 className="flex items-center gap-2 text-sm font-semibold text-mat-on">
          Other saved tenders <span className="d-tab-count">{saved.length}</span>
        </h3>
        {saved.length ? (
          <ul className="mt-3 space-y-2">
            {saved.map((row, i) => (
              <ReminderRow key={row.id} row={row} index={i} />
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-mat-dim">Select a tender to keep it here. Important means the selection is on frequent reminders.</p>
        )}
      </div>
    </section>
  );
}

const DOT = { 'remind-urgent': 'bg-red-400', 'remind-soon': 'bg-amber-400', 'remind-past': 'bg-[var(--md-dim)]' };

function Band({ title, tone, empty, rows, index }) {
  return (
    <section className="d-card d-rise p-3.5" style={{ animationDelay: `${index * 70}ms` }}>
      <h3 className="flex items-center gap-2 text-sm font-semibold text-mat-on">
        <span className={`h-2 w-2 rounded-full ${DOT[tone] || 'bg-[var(--md-primary)]'} ${tone === 'remind-urgent' && rows.length ? 'd-ping text-red-400' : ''}`} aria-hidden="true" />
        {title}
        <span className="d-tab-count ml-auto">{rows.length}</span>
      </h3>
      {rows.length ? (
        <ul className="mt-3 space-y-2">
          {rows.map((row, i) => (
            <ReminderRow key={row.id} row={row} index={i} />
          ))}
        </ul>
      ) : (
        <p className="mt-3 rounded-lg border border-dashed border-[var(--md-border)] px-3 py-4 text-center text-xs text-mat-dim">{empty}</p>
      )}
    </section>
  );
}

function ReminderRow({ row, index = 0 }) {
  const when = row.days == null ? '' : row.days === -3 ? '3 days ago' : relativeDays(row.bidSubmissionEnd);
  return (
    <li className="d-rise rounded-xl border border-[var(--md-border)] bg-[var(--md-surface2)] px-3.5 py-3 text-sm transition-colors hover:border-[color-mix(in_srgb,var(--md-primary)_50%,var(--md-border))]" style={{ animationDelay: `${Math.min(index, 8) * 45}ms` }}>
      <div className="flex flex-wrap items-center gap-1.5">
        {row.important ? <span className="d-badge d-badge-warn">Important</span> : <span className="d-badge d-badge-neutral">Saved</span>}
        {row.central ? <CentralBadge /> : null}
        <SampleBadge on={row.isSample} />
        <StageBadge stage={row.stage} />
        {when ? <span className="ml-auto text-[11px] text-mat-dim">Bid end {when}</span> : null}
      </div>
      <Link href={`/tenders/desk/tenders/${row.id}`} className="mt-1.5 block font-medium leading-6 text-mat-on decoration-[var(--md-primary)] underline-offset-4 hover:underline">
        {row.title}
      </Link>
      <p className="mt-0.5 text-xs text-mat-dim">
        {row.sourceName}
        {row.estimatedValue != null ? <> · <span className="font-medium text-mat-muted">{formatINR(row.estimatedValue)}</span></> : null}
      </p>
      {row.documents?.length || row.criteria?.length ? (
        <div className="mt-2.5 space-y-1.5">
          {row.documents?.length ? <Need label="document requirements" items={row.documents} tone="accent" /> : null}
          {row.criteria?.length ? <Need label="eligibility requirements" items={row.criteria} tone="warn" /> : null}
        </div>
      ) : null}
    </li>
  );
}

function Need({ label, items, tone }) {
  return (
    <details className="group/n rounded-lg bg-[var(--md-surface)]">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-2.5 py-1.5 text-xs font-medium text-mat-muted hover:text-mat-on">
        <span className={`d-badge d-badge-${tone} !px-1.5 tabular-nums`}>{items.length}</span>
        {label} to review
        <ChevronDown size={13} aria-hidden="true" className="ml-auto transition-transform group-open/n:rotate-180" />
      </summary>
      <ul className="d-fade-in list-disc space-y-1 px-2.5 pb-2.5 pl-7 text-xs leading-5 text-mat-muted">{items.map((item, i) => <li key={i}>{item}</li>)}</ul>
    </details>
  );
}
