'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { formatINR, formatIST, placeLabel } from '@/lib/desk/format';
import { STAGE_LABEL } from '@/lib/desk/constants';
import { api } from './api';
import { Button, CentralBadge, SampleBadge, StageBadge } from './ui';

export function TenderTable({ rows, kind = 'tenders', empty, returnTo = '/tenders/desk/search' }) {
  const router = useRouter();
  const [busy, setBusy] = useState(null);
  const [addedId, setAddedId] = useState('');
  const [error, setError] = useState('');

  async function selectRow(row) {
    setBusy(row.id);
    setError('');
    try {
      await api(`/api/desk/tenders/${row.id}/select`, { method: 'POST', json: {} });
      setAddedId(row.id);
      setBusy(null);
      window.setTimeout(() => router.refresh(), 2200);
    } catch (err) {
      setError(err.message);
      setBusy(null);
    }
  }

  if (!rows?.length) return empty || null;

  return (
    <div>
      {error ? <p className="mb-2 text-sm text-red-700">{error}</p> : null}
      <ul className="divide-y divide-ink-100 overflow-hidden rounded-lg border border-ink-200 bg-white">
        {rows.map((row) => (
          <li key={row.id} className={`grid gap-2 px-3 py-2.5 sm:grid-cols-[1fr_auto] sm:items-center${row.central ? ' tender-central' : ''}`}>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <a href={`/tenders/desk/tenders/${row.id}?from=${encodeURIComponent(returnTo)}`} className="font-medium text-ink-950 hover:underline">
                  {row.title}
                </a>
                {row.central ? <CentralBadge /> : null}
                <SampleBadge on={row.isSample} />
                <StageBadge stage={row.stage} />
              </div>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-ink-600">
                <span>{row.sourceName}</span>
                <span>{placeLabel(row)}</span>
                {row.scheme ? <span>{row.scheme}</span> : null}
                <span className="tabular">{kind === 'projects' && row.awardedValue != null ? `Awarded ${formatINR(row.awardedValue)}` : formatINR(row.estimatedValue)}</span>
                {kind === 'projects' ? (
                  <span className="tabular">SD held {formatINR(row.sdHeld)}</span>
                ) : (
                  <span className="tabular">EMD {formatINR(row.emdAmount)}</span>
                )}
                <span className="tabular">Bid end {formatIST(row.bidSubmissionEnd)}</span>
                <span className="sm:hidden">{STAGE_LABEL[row.stage]}</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {row.selectedByMe || addedId === row.id ? (
                <Button variant="secondary" onClick={() => router.push(`/tenders/desk/tenders/${row.id}`)}>
                  Open
                </Button>
              ) : (
                <Button onClick={() => selectRow(row)} disabled={busy === row.id}>
                  {busy === row.id ? 'Adding…' : 'Select'}
                </Button>
              )}
              {addedId === row.id ? <span className="d-added" role="status">Added to my tenders</span> : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
