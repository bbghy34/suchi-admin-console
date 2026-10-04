'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/components/desk/api';
import { AppStatusBadge, Button, ErrorBox, Field, PageTitle, SampleBadge, inputClass } from '@/components/desk/ui';
import { formatINR, formatISTDate } from '@/lib/desk/format';
import { APPLICATION_STATUSES } from '@/lib/desk/constants';

export function ApplicationView({ application, person }) {
  const router = useRouter();
  const t = application.tender;
  const [letter, setLetter] = useState(application.letterText);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const canAccounts = person.isAccounts || person.isAdmin;
  const kindLabel = application.kind === 'EMD' ? 'EMD refund' : 'Security money';

  async function patch(fields, form) {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      if (form) await api(`/api/desk/applications/${application.id}`, { method: 'PATCH', form });
      else await api(`/api/desk/applications/${application.id}`, { method: 'PATCH', json: fields });
      router.refresh();
      setBusy(false);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  function submitStatus(status, extra = {}) {
    const form = new FormData();
    form.set('status', status);
    form.set('letterText', letter);
    for (const [k, v] of Object.entries(extra)) form.set(k, v);
    return patch(null, form);
  }

  return (
    <div className="space-y-4">
      <PageTitle
        kicker={kindLabel}
        aside={
          <a href={`/tenders/desk/print/${application.id}`} target="_blank" rel="noreferrer">
            <Button variant="secondary">Print view</Button>
          </a>
        }
      >
        Refund application
      </PageTitle>
      <ErrorBox>{error}</ErrorBox>
      <p className="text-sm">
        <AppStatusBadge status={application.status} /> ·{' '}
        <a className="font-medium hover:underline" href={`/tenders/desk/tenders/${t.id}`}>
          {t.title}
        </a>{' '}
        <SampleBadge on={t.isSample} />
      </p>
      <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-[11px] uppercase text-ink-500">Source</dt>
          <dd>{t.source?.displayName}</dd>
        </div>
        <div>
          <dt className="text-[11px] uppercase text-ink-500">Tender id</dt>
          <dd>{t.portalTenderId || '—'}</dd>
        </div>
        <div>
          <dt className="text-[11px] uppercase text-ink-500">Awarded value</dt>
          <dd className="tabular">{formatINR(t.awardedValue)}</dd>
        </div>
        <div>
          <dt className="text-[11px] uppercase text-ink-500">Completion date</dt>
          <dd>{t.completionDate ? formatISTDate(t.completionDate) : '—'}</dd>
        </div>
      </dl>
      <p className="text-sm text-ink-700">
        Refund office: {application.officerName}, {application.officeName}, {application.officeDept}, {application.officeAddress},{' '}
        {application.officeDistrict}, {application.officeState}
      </p>
      <ul className="text-sm">
        {(application.instrumentsSnapshot ? JSON.parse(application.instrumentsSnapshot) : application.instruments).map((i) => (
          <li key={i.id}>
            {i.form} number {i.number} dated {i.instrumentDate ? formatISTDate(i.instrumentDate) : '—'}, {formatINR(i.amount)}, {i.bank}
          </li>
        ))}
      </ul>
      <Field label="Letter">
        <textarea className={inputClass('min-h-[280px] font-mono text-xs')} value={letter} onChange={(e) => setLetter(e.target.value)} />
      </Field>
      {canAccounts && application.status === 'DRAFT' ? (
        <Button disabled={busy} onClick={() => submitStatus('SUBMITTED')}>
          Mark as applied
        </Button>
      ) : null}
      {canAccounts && application.status === 'SUBMITTED' ? (
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" disabled={busy} onClick={() => submitStatus('ACKNOWLEDGED')}>
            Acknowledged
          </Button>
          <Button disabled={busy} onClick={() => submitStatus('RELEASED')}>
            Released
          </Button>
        </div>
      ) : null}
      {canAccounts && application.status === 'ACKNOWLEDGED' ? (
        <Button disabled={busy} onClick={() => submitStatus('RELEASED')}>
          Released
        </Button>
      ) : null}
      {canAccounts && ['DRAFT', 'SUBMITTED', 'ACKNOWLEDGED'].includes(application.status) ? (
        <form
          className="max-w-lg space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            const note = new FormData(e.target).get('rejectNote');
            submitStatus('REJECTED', { rejectNote: note });
          }}
        >
          <Field label={application.status === 'DRAFT' ? 'Reason for cancelling this draft' : 'If the office refused, a note is required'}>
            <input name="rejectNote" required className={inputClass()} />
          </Field>
          <Button variant="danger" type="submit" disabled={busy}>
            {application.status === 'DRAFT' ? 'Cancel draft' : 'Rejected'}
          </Button>
        </form>
      ) : null}
      {canAccounts && letter !== application.letterText && application.status === 'DRAFT' ? (
        <Button variant="secondary" disabled={busy} onClick={() => patch({ letterText: letter })}>
          Save letter
        </Button>
      ) : null}
      <p className="text-xs text-ink-500">
        Status list: {APPLICATION_STATUSES.map(([, l]) => l).join(' · ')}. This application is an internal case. The desk does not file it on a government website.
      </p>
    </div>
  );
}
