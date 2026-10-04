'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/components/desk/api';
import { Button, ErrorBox, Field, MarkBadge, PageTitle, RoleList, inputClass } from '@/components/desk/ui';

export function PeopleDesk({ people, sources, assignments, firmName, workCategories, fetchAssigneeId, fetchBackupId }) {
  const router = useRouter();
  const [error, setError] = useState('');

  async function saveSettings(e) {
    e.preventDefault();
    setError('');
    try {
      const form = new FormData(e.target);
      await api('/api/desk/people', { method: 'PATCH', json: Object.fromEntries(form.entries()) });
      router.refresh();
    } catch (err) {
      setError(err.message);
    }
  }

  async function assign(e) {
    e.preventDefault();
    setError('');
    try {
      const form = new FormData(e.target);
      await api('/api/desk/assignments', { method: 'POST', json: Object.fromEntries(form.entries()) });
      e.target.reset();
      router.refresh();
    } catch (err) {
      setError(err.message);
    }
  }

  async function saveSource(id, patch) {
    setError('');
    try {
      await api(`/api/desk/sources/${id}`, { method: 'PATCH', json: patch });
      router.refresh();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="space-y-8">
      <PageTitle>People</PageTitle>
      <ErrorBox>{error}</ErrorBox>

      <form onSubmit={saveSettings} className="grid max-w-2xl gap-3 rounded-lg border border-ink-200 bg-white p-4">
        <h2 className="font-semibold">Desk settings</h2>
        <Field label="Firm name">
          <input name="firmName" defaultValue={firmName} className={inputClass()} />
        </Field>
        <Field label="Person who fetches tenders daily">
          <select name="fetchAssigneeId" defaultValue={fetchAssigneeId} className={inputClass()}>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Backup">
          <select name="fetchBackupId" defaultValue={fetchBackupId} className={inputClass()}>
            <option value="">None</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Work categories" hint="One per line.">
          <textarea name="workCategories" defaultValue={workCategories.join('\n')} className={inputClass('min-h-[100px]')} />
        </Field>
        <Button type="submit">Save settings</Button>
      </form>

      <form onSubmit={assign} className="grid max-w-2xl gap-3 rounded-lg border border-ink-200 bg-white p-4 sm:grid-cols-2">
        <h2 className="font-semibold sm:col-span-2">Reassign the fetcher for a date range</h2>
        <Field label="Person">
          <select name="personId" className={inputClass()}>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="From">
          <input name="fromDate" type="date" required className={inputClass()} />
        </Field>
        <Field label="To">
          <input name="toDate" type="date" required className={inputClass()} />
        </Field>
        <Field label="Note">
          <input name="note" className={inputClass()} />
        </Field>
        <div className="sm:col-span-2">
          <Button type="submit">Save assignment</Button>
        </div>
        {assignments.length ? (
          <ul className="sm:col-span-2 text-sm text-ink-600">
            {assignments.map((a) => (
              <li key={a.id}>
                {a.person?.name}: {a.fromDate} to {a.toDate}
                {a.note ? ` · ${a.note}` : ''}
              </li>
            ))}
          </ul>
        ) : null}
      </form>

      <section>
        <h2 className="mb-2 font-semibold">Office users</h2>
        <ul className="divide-y divide-ink-100 rounded-lg border border-ink-200 bg-white">
          {people.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
              <span>
                {p.name} · <RoleList roles={String(p.roles).split(',')} />
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-sm text-ink-600">Add or update staff accounts in Luit. Eligible employees appear here after opening Tender Desk.</p>
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">Source register</h2>
        <p className="text-sm text-ink-600">Correct a URL if a host does not open. Switch all-India on to widen a Northeast place-of-work rule. GePNIC is the platform shape, not a daily inbox.</p>
        {sources.map((s) => {
          let config = {};
          try {
            config = s.config ? JSON.parse(s.config) : {};
          } catch {
            config = {};
          }
          return (
            <form
              key={s.id}
              className="rounded-lg border border-ink-200 bg-white p-3 text-sm"
              onSubmit={(e) => {
                e.preventDefault();
                const form = new FormData(e.target);
                const patch = { url: form.get('url'), extraUrls: form.get('extraUrls'), allIndia: form.get('allIndia') === 'on' };
                if (s.id === 'coal-india') {
                  patch.config = JSON.stringify({
                    subsidiaries: config.subsidiaries || ['ECL', 'BCCL', 'CCL', 'NCL', 'WCL', 'SECL', 'MCL', 'CMPDI'],
                    subsidiariesOn: form.getAll('subOn'),
                  });
                }
                saveSource(s.id, patch);
              }}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{s.displayName}</span>
                <MarkBadge mark={s.mark} note={s.markNote} />
                {!s.isDaily ? <span className="text-xs text-ink-500">Not a daily row</span> : null}
              </div>
              <p className="mt-1 text-xs text-ink-500">{s.intakeRule}</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <Field label="URL">
                  <input name="url" defaultValue={s.url} className={inputClass()} />
                </Field>
                <Field label="Extra URLs">
                  <textarea name="extraUrls" defaultValue={s.extraUrls || ''} className={inputClass()} />
                </Field>
              </div>
              {s.id !== 'iocl' && s.id !== 'ntpc' && s.isDaily ? (
                <label className="mt-2 flex items-center gap-2 text-sm">
                  <input type="checkbox" name="allIndia" defaultChecked={s.allIndia} /> All India is on (widen this source)
                </label>
              ) : s.allIndia ? (
                <p className="mt-2 text-xs text-ink-500">All India is on for this source.</p>
              ) : null}
              {s.id === 'coal-india' ? (
                <div className="mt-2">
                  <p className="text-xs font-medium">Subsidiaries switched on (otherwise Northeast place of work only)</p>
                  {(config.subsidiaries || []).map((sub) => (
                    <label key={sub} className="mr-3 text-xs">
                      <input type="checkbox" name="subOn" value={sub} defaultChecked={(config.subsidiariesOn || []).includes(sub)} /> {sub}
                    </label>
                  ))}
                </div>
              ) : null}
              <Button type="submit" variant="secondary" className="mt-2">
                Save source
              </Button>
            </form>
          );
        })}
      </section>
    </div>
  );
}
