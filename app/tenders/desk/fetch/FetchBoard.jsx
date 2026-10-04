'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/components/desk/api';
import { Button, ErrorBox, Field, MarkBadge, inputClass } from '@/components/desk/ui';
import { FETCH_OUTCOMES } from '@/lib/desk/constants';
import { formatIST } from '@/lib/desk/format';

function groupRows(rows) {
  const out = [];
  let neStarted = false;
  for (const row of rows) {
    if (row.source.groupKey === 'NE' && !neStarted) {
      out.push({ type: 'heading', title: 'All NE state tenders', note: 'One daily row per state portal. Assam and Tripura are pinned.' });
      neStarted = true;
    }
    out.push({ type: 'row', ...row });
  }
  return out;
}

export function FetchBoard({ day, assignment, streak, lastBySource, canWork, personId }) {
  const router = useRouter();
  const [error, setError] = useState('');
  const [reasonFor, setReasonFor] = useState(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(null);

  async function mark(sourceId, outcome, extra = {}) {
    setBusy(sourceId);
    setError('');
    try {
      await api(`/api/desk/fetch/${sourceId}`, { method: 'POST', json: { outcome, ...extra } });
      setReasonFor(null);
      setReason('');
      router.refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  }

  async function reopen(sourceId) {
    setBusy(sourceId);
    try {
      await api(`/api/desk/fetch/${sourceId}`, { method: 'DELETE' });
      router.refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  }

  const items = groupRows(day.rows);

  return (
    <div className="space-y-3">
      <ErrorBox>{error}</ErrorBox>
      {day.complete ? (
        <p className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          Today’s portal review completed{day.finishedAt ? ` at ${formatIST(day.finishedAt)}` : ''}
          {day.finishedBy ? ` by ${day.finishedBy.name}` : ''}. Streak: {streak} weekday{streak === 1 ? '' : 's'}.
        </p>
      ) : (
        <p className="text-sm text-ink-700">
          {day.done} of {day.total} portals reviewed.
          {assignment.override ? ` Override ${assignment.override.fromDate} to ${assignment.override.toDate}.` : ''} Streak of finished weekdays: {streak}.
        </p>
      )}

      <ul className="space-y-2">
        {items.map((item, idx) => {
          if (item.type === 'heading') {
            return (
              <li key={`h-${idx}`} className="pt-2 text-xs font-semibold uppercase tracking-wide text-ink-500">
                {item.title}
                <span className="ml-2 font-normal normal-case text-ink-500">{item.note}</span>
              </li>
            );
          }
          const s = item.source;
          const log = item.log;
          const last = lastBySource[s.id];
          return (
            <li key={s.id} className="rounded-lg border border-ink-200 bg-white p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-ink-950">{s.displayName}</span>
                    <MarkBadge mark={s.mark} note={s.markNote} />
                    {log ? (
                      <span className="text-xs text-ink-600">
                        {log.outcome === 'NO_NEW' ? s.noNewLabel || FETCH_OUTCOMES.NO_NEW : FETCH_OUTCOMES[log.outcome] || log.outcome}
                        {log.person?.name ? ` · ${log.person.name}` : ''} · {formatIST(log.at)}
                        {log.reason ? ` · ${log.reason}` : ''}
                      </span>
                    ) : (
                      <span className="text-xs text-amber-800">Open</span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-ink-600">{s.officialName}</p>
                  <p className="mt-1 text-xs text-ink-500">{s.intakeRule}</p>
                  <div className="mt-1 flex flex-wrap gap-3 text-xs">
                    {s.url ? (
                      <a href={s.url} target="_blank" rel="noreferrer" className="text-desk underline">
                        Open the official desk
                      </a>
                    ) : (
                      <span className="text-ink-500">No separate bid site — notices sit on the state portal.</span>
                    )}
                    {(s.extraUrls || '')
                      .split('\n')
                      .filter(Boolean)
                      .map((u) => (
                        <a key={u} href={u} target="_blank" rel="noreferrer" className="text-desk underline">
                          {u.replace(/^https?:\/\//, '').slice(0, 40)}
                        </a>
                      ))}
                  </div>
                  {last && last.date !== day.dateKey ? (
                    <p className="mt-1 text-[11px] text-ink-400">
                      Last: {FETCH_OUTCOMES[last.outcome] || last.outcome} by {last.person?.name} on {last.date} at {formatIST(last.at)}
                      {last.reason ? ` (${last.reason})` : ''}
                    </p>
                  ) : null}
                </div>
              </div>
              {canWork ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button variant="secondary" onClick={() => router.push(`/tenders/desk/upload?sourceId=${encodeURIComponent(s.id)}`)}>
                    Upload tender and documents
                  </Button>
                  {!log ? (
                    <>
                      <Button variant="secondary" disabled={busy === s.id} onClick={() => mark(s.id, 'NO_NEW')}>
                        {s.noNewLabel || 'No new tender'}
                      </Button>
                      <Button variant="secondary" disabled={busy === s.id} onClick={() => setReasonFor(s.id)}>
                        Could not open the portal
                      </Button>
                    </>
                  ) : log.outcome !== 'UPLOADED' ? (
                    <Button variant="ghost" disabled={busy === s.id} onClick={() => reopen(s.id)}>
                      Reopen this row
                    </Button>
                  ) : null}
                </div>
              ) : null}
              {reasonFor === s.id ? (
                <div className="mt-3 max-w-md space-y-2 rounded bg-ink-50 p-3">
                  <Field label="Reason" required hint="Timeout, maintenance notice, certificate error.">
                    <input className={inputClass()} value={reason} onChange={(e) => setReason(e.target.value)} />
                  </Field>
                  <div className="flex gap-2">
                    <Button disabled={!reason.trim() || busy === s.id} onClick={() => mark(s.id, 'COULD_NOT_OPEN', { reason })}>
                      Save
                    </Button>
                    <Button variant="ghost" onClick={() => setReasonFor(null)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : null}
              {log?.outcome === 'COULD_NOT_OPEN' ? (
                <p className="mt-2 text-sm text-red-800">Could not open the portal: {log.reason}. The admin should correct the stored URL on People.</p>
              ) : null}
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-ink-500">
        Open a portal to review its notices, then upload new tenders here. You can also find tenders through search and use “Save tender & files” to retrieve supported documents automatically.
        This checklist records portal reviews and uploads for the selected day. Running file retrievals and their results are in Downloads. Reviews are tracked on weekdays.
      </p>
    </div>
  );
}
