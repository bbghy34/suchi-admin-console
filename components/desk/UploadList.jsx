'use client';

import { useMemo, useState } from 'react';
import { ALL_STATES, isCentralSource, NE_STATES } from '@/lib/desk/constants';
import { formatINR, formatIST } from '@/lib/desk/format';
import { CentralBadge, SampleBadge } from './ui';

export function UploadList({ rows, sources }) {
  const [keyword, setKeyword] = useState('');
  const [sourceId, setSourceId] = useState('');
  const [region, setRegion] = useState('');
  const [kind, setKind] = useState('real');

  const shown = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    return rows.filter((row) => {
      if (kind === 'real' && row.isSample) return false;
      if (kind === 'sample' && !row.isSample) return false;
      if (sourceId && row.sourceId !== sourceId) return false;
      if (region === 'central' && !row.central) return false;
      if (region === 'ne' && !inStates(row, NE_STATES)) return false;
      if (region && region !== 'central' && region !== 'ne' && !inStates(row, [region])) return false;
      if (!q) return true;
      const hay = [row.title, row.portalTenderId, row.referenceNo, row.sourceName, row.place, row.searchKeywords].join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [rows, keyword, sourceId, region, kind]);

  return (
    <section className="mt-8">
      <h2 className="text-sm font-semibold text-ink-900">Uploads ({shown.length} of {rows.length})</h2>
      <div className="mt-3 grid gap-3 rounded-lg border border-ink-200 bg-white p-3 sm:grid-cols-4">
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-ink-800">Keyword</span>
          <input className="w-full rounded border border-ink-300 bg-white px-2 py-1.5 text-sm" value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="Title, tender id, NIT" />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-ink-800">Source</span>
          <select className="w-full rounded border border-ink-300 bg-white px-2 py-1.5 text-sm" value={sourceId} onChange={(e) => setSourceId(e.target.value)}>
            <option value="">Any source</option>
            {sources.map((s) => (
              <option key={s.id} value={s.id}>{s.displayName}</option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-ink-800">Region</span>
          <select className="w-full rounded border border-ink-300 bg-white px-2 py-1.5 text-sm" value={region} onChange={(e) => setRegion(e.target.value)}>
            <option value="">Any region</option>
            <option value="ne">Northeast</option>
            <option value="central">Central</option>
            {ALL_STATES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-ink-800">Rows</span>
          <select className="w-full rounded border border-ink-300 bg-white px-2 py-1.5 text-sm" value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="all">All uploads</option>
            <option value="real">Real uploads only</option>
            <option value="sample">Samples only</option>
          </select>
        </label>
      </div>
      {shown.length ? (
        <ul className="mt-3 divide-y divide-ink-100 overflow-hidden rounded-lg border border-ink-200 bg-white">
          {shown.map((row) => (
            <li key={row.id} className={`px-3 py-2.5${row.central ? ' tender-central' : ''}`}>
              <div className="flex flex-wrap items-center gap-2">
                <a href={`/tenders/desk/tenders/${row.id}`} className="font-medium text-ink-950 hover:underline">{row.title}</a>
                {row.central ? <CentralBadge /> : null}
                <SampleBadge on={row.isSample} />
              </div>
              <p className="mt-1 text-xs text-ink-600">
                {row.sourceName}
                {' · '}
                {row.place}
                {' · '}
                {formatINR(row.estimatedValue)}
                {' · '}
                Bid end {formatIST(row.bidSubmissionEnd)}
                {' · '}
                {row.fileCount} file{row.fileCount === 1 ? '' : 's'}
                {row.portalTenderId ? ` · ${row.portalTenderId}` : ''}
                {row.searchKeywords ? ` · ${String(row.searchKeywords).split(',').join(', ')}` : ' · No keywords'}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 rounded border border-dashed border-ink-300 bg-white px-4 py-6 text-sm text-ink-600">No upload matches these filters.</p>
      )}
    </section>
  );
}

function inStates(row, states) {
  if (row.central && isCentralSource(row.sourceId) && !row.state && !row.placeOfWorkState && !row.gemConsigneeState) return false;
  return [row.state, row.placeOfWorkState, row.gemConsigneeState].some((name) => states.includes(name));
}
