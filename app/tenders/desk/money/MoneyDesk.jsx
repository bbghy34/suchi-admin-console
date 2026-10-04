'use client';

import { useState } from 'react';
import { formatINR, formatIST, formatISTDate } from '@/lib/desk/format';
import { nextExpiryReminder } from '@/lib/desk/money';
import { INSTRUMENT_STATUS_LABEL } from '@/lib/desk/constants';
import { Card, Empty, PageTitle, SampleBadge, StageBadge, StatusBadge } from '@/components/desk/ui';

export function MoneyDesk({ emd, sd, emdTotals, sdTotals, projects, summary }) {
  const [tab, setTab] = useState('emd');

  return (
    <div>
      <PageTitle>Money</PageTitle>
      {summary ? <MoneyOverview summary={summary} /> : null}
      <div className="mb-4 flex flex-wrap gap-1 border-b border-ink-200">
        {[
          ['emd', 'EMD'],
          ['sd', 'Security Deposit'],
          ['project', 'By project'],
        ].map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`px-3 py-2 text-sm ${tab === id ? 'border-b-2 border-desk font-semibold text-desk' : 'text-ink-600'}`}
            aria-pressed={tab === id}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === 'emd' ? <CategoryTab rows={emd} totals={emdTotals} empty="No EMD instruments yet." /> : null}
      {tab === 'sd' ? <CategoryTab rows={sd} totals={sdTotals} empty="No Security Deposit instruments yet." /> : null}
      {tab === 'project' ? <ProjectTab projects={projects} /> : null}
    </div>
  );
}

export function MoneyOverview({summary}) {
  const {totals,categories}=summary;
  return <section aria-label="EMD and security deposit overview" className="mb-6 space-y-3">
    <p className="text-sm text-ink-600">Deposits and guarantees for the tenders you can access. Sample records are excluded.</p>
    <div className="grid grid-cols-2 gap-2 text-sm lg:grid-cols-4">
      <Stat label="EMD held" value={formatINR(totals.emdHeld)} />
      <Stat label="Security Deposit held" value={formatINR(totals.sdHeld)} />
      <Stat label="Refund requested · included in held" value={formatINR(totals.refundRequested)} />
      <Stat label="To arrange · not yet submitted" value={formatINR(totals.toArrange)} />
    </div>
    <p className="text-xs text-ink-500">Held includes submitted instruments and pending refunds. Guarantees show their face value. Refundable deposits are not expenses.</p>
    {categories.length ? <div className="overflow-x-auto rounded-lg border border-ink-200 bg-white">
      <table className="w-full text-left text-sm">
        <caption className="px-3 py-2 text-left font-semibold">By work category</caption>
        <thead className="border-y border-ink-100 bg-ink-50 text-xs text-ink-600"><tr>
          <th scope="col" className="px-3 py-2">Category</th><th scope="col" className="px-3 py-2 text-right">Projects</th>
          <th scope="col" className="px-3 py-2 text-right">EMD held</th><th scope="col" className="px-3 py-2 text-right">SD held</th>
          <th scope="col" className="px-3 py-2 text-right">Refunded · all time</th><th scope="col" className="px-3 py-2 text-right">To arrange</th>
        </tr></thead>
        <tbody className="divide-y divide-ink-100">{categories.map(row=><tr key={row.category}>
          <th scope="row" className="px-3 py-2 font-medium">{row.category}</th><td className="px-3 py-2 text-right tabular">{row.projectCount}</td>
          {[row.emdHeld,row.sdHeld,row.refunded,row.toArrange].map((amount,index)=><td key={index} className="whitespace-nowrap px-3 py-2 text-right tabular">{formatINR(amount)}</td>)}</tr>)}</tbody>
      </table>
    </div> : <p className="text-sm text-ink-500">Add an EMD or Security Deposit on a tender to see its totals here.</p>}
    {categories.some(row=>row.category==='Uncategorized') ? <p className="text-xs text-ink-500">Uncategorized means no work category has been saved on the tender.</p> : null}
  </section>;
}

function Totals({ totals }) {
  return (
    <div className="mb-4 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
      <Stat label="Held" value={formatINR(totals.held)} />
      <Stat label="Refund applied" value={formatINR(totals.refundApplied)} />
      <Stat label="Refunded this year" value={formatINR(totals.refundedThisYear)} />
      <Stat label="Forfeited" value={formatINR(totals.forfeited)} />
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="rounded border border-ink-200 bg-white px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-ink-500">{label}</p>
      <p className="tabular font-semibold">{value}</p>
    </div>
  );
}

function CategoryTab({ rows, totals, empty }) {
  return (
    <div>
      <Totals totals={totals} />
      {rows.length ? (
        <ul className="divide-y divide-ink-100 overflow-hidden rounded-lg border border-ink-200 bg-white">
          {rows.map((i) => (
            <li key={i.id} className="grid gap-1 px-3 py-2 text-sm sm:grid-cols-[1fr_auto]">
              <div>
                <a href={`/tenders/desk/tenders/${i.tenderId}`} className="font-medium hover:underline">
                  {i.tender?.title}
                </a>
                <SampleBadge on={i.tender?.isSample} />
                <p className="text-xs text-ink-600">
                  {i.tender?.source?.displayName} · {i.form} · {i.number || 'no number'} · {i.refundOfficeName || i.submittedToName || '—'}
                  {i.expiryDate ? ` · expires ${formatISTDate(i.expiryDate)}` : ''}
                  {i.form === 'Bank guarantee' && nextExpiryReminder(i.expiryDate) ? ` · next reminder ${formatIST(nextExpiryReminder(i.expiryDate))}` : ''}
                </p>
              </div>
              <div className="tabular text-right">
                <div className="font-medium">{formatINR(i.amount)}</div>
                <StatusBadge status={i.status} />
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <Empty>{empty}</Empty>
      )}
    </div>
  );
}

function ProjectTab({ projects }) {
  if (!projects.length) return <Empty>No projects with instruments yet.</Empty>;
  return (
    <div className="space-y-3">
      {projects.map((p) => (
        <Card
          key={p.id}
          title={
            <span className="flex flex-wrap items-center gap-2">
              <a href={`/tenders/desk/tenders/${p.id}`} className="hover:underline">
                {p.title}
              </a>
              <SampleBadge on={p.isSample} />
              <StageBadge stage={p.stage} />
            </span>
          }
        >
          <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-[11px] uppercase text-ink-500">Awarded value</dt>
              <dd className="tabular">{formatINR(p.awardedValue)}</dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase text-ink-500">EMD held</dt>
              <dd className="tabular">{formatINR(p.emdHeld)}</dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase text-ink-500">Security Deposit held</dt>
              <dd className="tabular">{formatINR(p.sdHeld)}</dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase text-ink-500">Completion / application</dt>
              <dd>
                {p.hasCertificate ? 'Certificate on file' : 'No completion certificate'} · {p.hasApplication ? 'Refund application exists' : 'No application'}
              </dd>
            </div>
          </dl>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <h3 className="text-xs font-semibold uppercase text-ink-500">EMD</h3>
              <InstList rows={p.instruments.filter((i) => i.category === 'EMD')} />
            </div>
            <div>
              <h3 className="text-xs font-semibold uppercase text-ink-500">Security Deposit</h3>
              <InstList rows={p.instruments.filter((i) => i.category === 'SD')} />
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

function InstList({ rows }) {
  if (!rows.length) return <p className="text-sm text-ink-500">None</p>;
  return (
    <ul className="text-sm">
      {rows.map((i) => (
        <li key={i.id}>
          {i.form} {i.number} {formatINR(i.amount)} · {INSTRUMENT_STATUS_LABEL[i.status]}
          {i.form === 'Bank guarantee' && nextExpiryReminder(i.expiryDate) ? ` · next reminder ${formatIST(nextExpiryReminder(i.expiryDate))}` : ''}
        </li>
      ))}
    </ul>
  );
}
