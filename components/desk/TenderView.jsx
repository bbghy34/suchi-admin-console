'use client';
import { WaitStatus } from '@/components/desk/WaitStatus';
import { TenderDates } from '@/components/desk/TenderDates';

import { useEffect, useState } from 'react';
import { Download, Eye } from 'lucide-react';
import { FileTypeIcon, fileKind, formatBytes } from '@/components/desk/FileTypeIcon';
import { useRouter } from 'next/navigation';
import { api } from '@/components/desk/api';
import { InstrumentForm } from '@/components/desk/InstrumentForm';
import {
  AppStatusBadge,
  Button,
  Card,
  ErrorBox,
  Field,
  SampleBadge,
  StageBadge,
  StatusBadge,
  WarnBox,
  inputClass,
} from '@/components/desk/ui';
import { DOCUMENT_TYPES, FREQUENCIES, STAGE_LABEL } from '@/lib/desk/constants';
import { formatINR, formatIST, formatISTDate, placeLabel } from '@/lib/desk/format';
import { toInputDate } from '@/lib/desk/ist';
import { emdRefundGate, heldTotal, nextExpiryReminder, securityMoneyGate } from '@/lib/desk/money';
import { buildBidDetails, NOT_AVAILABLE } from '@/lib/desk/bid-details';
import { readNoticeFacts } from '@/lib/desk/notice-facts';

export function TenderView({ tender, person, summary, missingFields, returnTo = '/tenders/desk/search' }) {
  const router = useRouter();
  const refresh = () => router.refresh();
  const mine = tender.selections.find((s) => s.personId === person.id);
  const canAccounts = person.isAccounts || person.isAdmin;
  const canBidder = person.isBidder || person.isAdmin;
  const canEditTender = person.isAdmin || (person.isExecutive && tender.createdById === person.id);
  const awarded = ['GOT_THE_BID', 'IN_EXECUTION', 'COMPLETED', 'SD_APPLIED', 'SD_RELEASED', 'CLOSED'].includes(tender.stage);
  const sdGate = securityMoneyGate(tender, tender.instruments, tender.documents);
  const emdGate = emdRefundGate(tender, tender.instruments);
  const missing = missingFields || [];
  const converted = tender.instruments.filter((i) => i.status === 'CONVERTED_TO_SD');
  const [tab, setTab] = useState('overview');
  const details = buildBidDetails(tender, summary);
  const tabs = [
    ['overview', 'Overview'],
    ['bid', 'Bid Details'],
    ['documents', 'Documents & requirements'],
    ['pq', 'PQ'],
    ['boq', 'BOQ'],
    ['corrigendum', 'Corrigendum'],
    ['timeline', 'Timeline'],
  ];

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <a href={returnTo} className="text-sm font-medium text-desk hover:underline">
          Back to search results
        </a>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold text-ink-950 sm:text-2xl">{tender.title}</h1>
          <SampleBadge on={tender.isSample} />
          <StageBadge stage={tender.stage} />
        </div>
        <p className="text-sm text-ink-600">
          {tender.orgChain || tender.gemBuyer || tender.source?.displayName || NOT_AVAILABLE} · {placeLabel(tender) || NOT_AVAILABLE}
          {tender.scheme ? ` · ${tender.scheme}` : ''}
          {/* Website files have an internal WEB- key; the NIT number is what people recognise. */}
          {tender.sourceId === 'official-site' && tender.referenceNo ? ` · ${tender.referenceNo}` : tender.portalTenderId ? ` · ${tender.portalTenderId}` : ''}
        </p>
        <div className="flex flex-wrap gap-2">
          {!mine ? <SelectButton tender={tender} /> : <FrequencyPicker tenderId={tender.id} frequency={mine.frequency} />}
          {canEditTender ? (
            <a href={`/tenders/desk/tenders/${tender.id}/edit`} className="d-btn d-btn-outline">Edit tender</a>
          ) : null}
        </div>
      </header>

      <div className="flex gap-1 overflow-x-auto border-b border-ink-200">
        {tabs.map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`shrink-0 border-b-2 px-3 py-2 text-sm ${tab === id ? 'border-desk font-semibold text-ink-950' : 'border-transparent text-ink-500 hover:text-ink-800'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'overview' ? (
        <>
          <TenderDates tender={tender} />
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
            <Item label="Tender value" value={shownMoney(tender.estimatedValue)} />
            <Item label="EMD" value={tender.emdAmount == null ? NOT_AVAILABLE : `${formatINR(tender.emdAmount)}${tender.emdMode ? ` · ${tender.emdMode}` : ''}`} />
            <Item label="Tender fee" value={shownMoney(tender.tenderFee)} />
            <Item label="Status" value={STAGE_LABEL[tender.stage] || tender.stage || NOT_AVAILABLE} />
            <Item label="Location" value={placeLabel(tender) || NOT_AVAILABLE} />
            {tender.bidOpeningPlace ? <Item label="Opening place" value={tender.bidOpeningPlace} /> : null}
            {!tender.bidSubmissionEnd ? <Item label="Bid submission end" value={NOT_AVAILABLE} /> : null}
          </dl>
          <p className="text-sm text-ink-700">{tender.description || NOT_AVAILABLE}</p>
          <NoticeRecord tender={tender} />
          {missing.length ? <WarnBox>Strongly prompted, still missing: {missing.join('; ')}.</WarnBox> : null}
          <StageBlock tender={tender} person={person} canBidder={canBidder} canAccounts={canAccounts} onDone={refresh} />
          {awarded ? (
            <Card title="Security money">
              <p className="mb-3 text-sm text-ink-600">The firm has the bid. Enter EMD and Security Deposit as separate instruments.</p>
              <MoneyBlock tender={tender} person={person} canAccounts={canAccounts} converted={converted} onDone={refresh} />
              {['GOT_THE_BID', 'IN_EXECUTION', 'COMPLETED'].includes(tender.stage) && canAccounts ? (
                <CompletionBlock tender={tender} onDone={refresh} />
              ) : null}
              {['SD_APPLIED', 'SD_RELEASED', 'CLOSED'].includes(tender.stage) && tender.completionDate ? <p className="mt-3 text-sm text-ink-600">Completion recorded: {formatISTDate(tender.completionDate)}{tender.completionAuthority ? ` · ${tender.completionAuthority}` : ''}. The certificate is in Documents &amp; requirements.</p> : null}
              <ApplyBlock kind="SD" tender={tender} gate={sdGate} canAccounts={canAccounts} />
            </Card>
          ) : (
            <p className="text-sm text-ink-600">Security money is entered after the firm gets the bid.</p>
          )}
          {['SELECTED', 'PREPARING_BID', 'BID_SUBMITTED', 'GOT_THE_BID', 'IN_EXECUTION', 'COMPLETED'].includes(tender.stage) && !awarded ? (
            <Card title="EMD">
              <MoneyBlock tender={tender} person={person} canAccounts={canAccounts} converted={converted} categoryFilter="EMD" onDone={refresh} />
            </Card>
          ) : null}
          {tender.stage === 'NOT_AWARDED' ? (
            <Card title="EMD refund">
              <MoneyBlock tender={tender} person={person} canAccounts={canAccounts} converted={converted} categoryFilter="EMD" onDone={refresh} />
              {converted.length && !tender.instruments.some((i) => i.category === 'EMD' && i.status !== 'CONVERTED_TO_SD') ? (
                <p className="text-sm text-ink-600">This EMD was converted to SD. The money is tracked on the Security Deposit. Apply for EMD refund is not offered.</p>
              ) : (
                <ApplyBlock kind="EMD" tender={tender} gate={emdGate} canAccounts={canAccounts} />
              )}
            </Card>
          ) : null}
        </>
      ) : null}

      {tab === 'bid' ? <BidDetailsPanel tenderId={tender.id} details={details} /> : null}

      {tab === 'documents' ? (
        <>
          <Documents tender={tender} onDone={refresh} match={(d) => d.type !== 'BOQ' && d.type !== 'Corrigendum' && !isPqDoc(d)} empty="No general documents on this tender." />
          <SummaryBlock tender={tender} summary={summary} person={person} onDone={refresh} />
        </>
      ) : null}

      {tab === 'pq' ? (
        <>
          <Card title="Pre-qualification">
            <p className="whitespace-pre-wrap text-sm text-ink-800">{sectionText(summary, 'eligibility')}</p>
          </Card>
          <Documents
            tender={tender}
            onDone={refresh}
            title="PQ documents"
            defaultType="Other"
            match={isPqDoc}
            empty="No PQ document is on this tender."
          />
        </>
      ) : null}

      {tab === 'boq' ? (
        <Documents tender={tender} onDone={refresh} title="BOQ" defaultType="BOQ" match={(d) => d.type === 'BOQ'} empty="No BOQ is on this tender." />
      ) : null}

      {tab === 'corrigendum' ? (
        <Documents
          tender={tender}
          onDone={refresh}
          title="Corrigendum"
          defaultType="Corrigendum"
          showChange
          match={(d) => d.type === 'Corrigendum'}
          empty="No corrigendum is on this tender."
        />
      ) : null}

      {tab === 'timeline' ? (
        <>
          <Card title="Dates">
            <dl className="grid gap-3 sm:grid-cols-2">
              {(details.groups.find((g) => g.name === 'Timeline')?.fields || []).map(([label, value]) => (
                <Item key={label} label={label} value={value} />
              ))}
            </dl>
          </Card>
          <Card title="Activity">
            <ul className="space-y-1 text-sm">
              {tender.activities.length ? tender.activities.map((a) => (
                <li key={a.id} className="text-ink-700">
                  <span className="text-ink-400 tabular">{formatIST(a.at)}</span> · {a.person?.name || 'Desk'} · {a.action}
                  {a.detail ? ` — ${a.detail}` : ''}
                </li>
              )) : <li className="text-ink-600">{NOT_AVAILABLE}</li>}
            </ul>
          </Card>
        </>
      ) : null}
    </div>
  );
}

function shownMoney(value) {
  return value == null || value === '' ? NOT_AVAILABLE : formatINR(value);
}

function sectionText(summary, key) {
  const section = summary?.sections?.find((item) => item.key === key);
  const text = (section?.text || '').trim();
  if (!text || text === 'Not found in the uploaded documents.') return NOT_AVAILABLE;
  return text;
}

function isPqDoc(doc) {
  const blob = `${doc.type || ''} ${doc.fileName || ''}`.toLowerCase();
  return /\bpq\b|pre-?qual|prequalification/.test(blob);
}

function BidDetailsPanel({ tenderId, details }) {
  return (
    <Card
      title="Bid Details"
      action={
        <div className="flex flex-wrap gap-2 text-xs">
          {['xlsx', 'csv', 'pdf', 'json'].map((format) => (
            <a key={format} className="rounded border border-ink-300 px-2 py-1 font-medium uppercase text-desk" href={`/api/desk/tenders/${tenderId}/export?format=${format}`}>
              {format === 'xlsx' ? 'Excel' : format.toUpperCase()}
            </a>
          ))}
        </div>
      }
    >
      <div className="space-y-5">
        {details.groups.map((group) => (
          <section key={group.name}>
            <h3 className="mb-2 text-sm font-semibold text-ink-950">{group.name}</h3>
            <dl className="grid gap-3 sm:grid-cols-2">
              {group.fields.map(([label, value]) => (
                <Item key={label} label={label} value={value} />
              ))}
            </dl>
          </section>
        ))}
      </div>
    </Card>
  );
}

function Item({ label, value }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-ink-500">{label}</dt>
      <dd className="tabular text-ink-900">{value}</dd>
    </div>
  );
}

function SelectButton({ tender }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [added, setAdded] = useState(false);
  const [error, setError] = useState('');
  async function go() {
    setBusy(true);
    setError('');
    try {
      await api(`/api/desk/tenders/${tender.id}/select`, { method: 'POST', json: {} });
      setAdded(true);
      setBusy(false);
      window.setTimeout(() => router.refresh(), 2200);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button onClick={go} disabled={busy || added}>
        {busy ? 'Adding…' : 'Select this tender'}
      </Button>
      {added ? <span className="d-added" role="status">Added to my tenders</span> : null}
      <ErrorBox>{error}</ErrorBox>
    </div>
  );
}

function FrequencyPicker({ tenderId, frequency }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [value, setValue] = useState(frequency);
  async function set(next) {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await api(`/api/desk/tenders/${tenderId}/select`, { method: 'PATCH', json: { frequency: next } });
      setValue(next);
      router.refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      <label className="flex items-center gap-2 text-sm">
        Notifications
        <select className={inputClass('w-auto')} value={value} disabled={busy} aria-busy={busy} onChange={(e) => set(e.target.value)}>
          {FREQUENCIES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </label>
      {busy && <p role="status" className="mt-1 text-xs text-ink-500">Saving notification preference…</p>}
      <ErrorBox>{error}</ErrorBox>
    </div>
  );
}

function Documents({ tender, onDone, title = 'Documents', match, defaultType = 'NIT', showChange = false, empty = 'No documents on this tender.' }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [docType, setDocType] = useState(defaultType);
  const docs = match ? tender.documents.filter(match) : tender.documents;

  async function upload(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const form = new FormData(e.target);
      await api(`/api/desk/tenders/${tender.id}/documents`, { method: 'POST', form });
      setOpen(false);
      onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      // Reopening "Add a document" must not show a stuck "Uploading…" button.
      setBusy(false);
    }
  }

  return (
    <Card
      title={title}
      action={
        <Button variant="secondary" onClick={() => setOpen((v) => !v)}>
          Add a document
        </Button>
      }
    >
      {docs.length ? (
        <ul className="space-y-2 text-sm">
          {docs.map((d) => (
            <li key={d.id} className="rounded-xl border border-[var(--md-border)] bg-[var(--md-surface2)] p-3">
              <div className="flex flex-wrap items-center gap-3">
                <a href={`/api/desk/documents/${d.id}`} target="_blank" rel="noreferrer" className="shrink-0" aria-label={`Preview ${d.fileName}`}>
                  {fileKind(d.fileName, d.mime) === 'image' ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`/api/desk/documents/${d.id}`} alt="" loading="lazy" className="h-12 w-12 rounded-lg border border-[var(--md-border)] object-cover" />
                  ) : (
                    <span className="grid h-12 w-12 place-items-center rounded-lg bg-[var(--md-surface)]"><FileTypeIcon fileName={d.fileName} mime={d.mime} size={30} /></span>
                  )}
                </a>
                <div className="min-w-0 flex-1">
                  <a className="block truncate font-medium text-mat-on hover:underline" href={`/api/desk/documents/${d.id}`} target="_blank" rel="noreferrer" title={d.fileName}>
                    {d.fileName}
                  </a>
                  <p className="mt-0.5 text-xs text-mat-dim">
                    <span className="d-badge d-badge-neutral mr-1.5">{d.type}</span>
                    {[formatBytes(d.size), d.uploadedBy?.name, formatIST(d.uploadedAt), d.docDate ? `dated ${formatISTDate(d.docDate)}` : ''].filter(Boolean).join(' · ')}
                    {d.textStatus && d.textStatus !== 'TEXT' ? (
                      <span className="ml-2 text-amber-500">{d.textStatus === 'IMAGE' ? 'photo, text not read' : 'text not read'}</span>
                    ) : null}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {['pdf', 'image'].includes(fileKind(d.fileName, d.mime)) ? (
                    <a className="d-btn d-btn-outline" href={`/api/desk/documents/${d.id}`} target="_blank" rel="noreferrer">
                      <Eye size={14} aria-hidden="true" /> Preview
                    </a>
                  ) : null}
                  <a className="d-btn d-btn-ghost" href={`/api/desk/documents/${d.id}?download=1`} download={d.fileName}>
                    <Download size={14} aria-hidden="true" /> Download
                  </a>
                </div>
              </div>
              {d.type === 'Corrigendum' ? (
                <dl className="mt-2 grid gap-2 sm:grid-cols-3">
                  <Item label="What changed" value={d.changeNote || NOT_AVAILABLE} />
                  <Item label="Previous value" value={d.previousValue || NOT_AVAILABLE} />
                  <Item label="Updated value" value={d.updatedValue || NOT_AVAILABLE} />
                </dl>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-ink-600">{empty}</p>
      )}
      {open ? (
        <form onSubmit={upload} className="mt-3 grid gap-2 sm:grid-cols-3">
          <ErrorBox>{error}</ErrorBox>
          <input name="file" type="file" required accept=".pdf,.doc,.docx,.rtf,.xls,.xlsx,.csv,.txt,image/*" className={inputClass()} />
          <select name="type" className={inputClass()} value={docType} onChange={(e) => setDocType(e.target.value)}>
            {DOCUMENT_TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
          <input name="docDate" type="date" className={inputClass()} />
          {showChange || docType === 'Corrigendum' ? (
            <>
              <input name="changeNote" placeholder="What changed" className={inputClass()} />
              <input name="previousValue" placeholder="Previous value" className={inputClass()} />
              <input name="updatedValue" placeholder="Updated value" className={inputClass()} />
            </>
          ) : null}
          {busy ? <WaitStatus title="Uploading and reading your files" detail="Please keep this page open until the files appear below. Larger PDFs can take longer to upload and read." /> : null}
          <Button type="submit" disabled={busy}>
            {busy ? 'Uploading…' : 'Upload'}
          </Button>
        </form>
      ) : null}
    </Card>
  );
}

function SummaryBlock({ tender, summary, person, onDone }) {
  const [busy, setBusy] = useState(!!tender.summaryBusy && !!tender.summaryStartedAt && Date.now() - new Date(tender.summaryStartedAt).getTime() < 10 * 60000);
  const [error, setError] = useState(tender.summaryError || '');
  const [live, setLive] = useState(summary);
  const [ticks, setTicks] = useState({});
  const summaryOutdated = tender.summaryAt && tender.documents.some((doc) => new Date(doc.uploadedAt) > new Date(tender.summaryAt));

  useEffect(() => { setLive(summary); }, [summary]);

  useEffect(() => {
    if (!tender.summaryBusy) return;
    setBusy(true);
    let active = true;
    let checking = false;
    const t = setInterval(async () => {
      if (checking) return;
      checking = true;
      try {
        const d = await api(`/api/desk/tenders/${tender.id}/summary`);
        if (!active) return;
        if (!d.busy) {
          clearInterval(t);
          setBusy(false);
          setLive(d.summary);
          setError(d.error || '');
          onDone();
        }
      } catch {
        if (!active) return;
        clearInterval(t);
        setBusy(false);
        setError('Could not check summary progress. Your files are saved. Reload this tender to check whether the summary finished.');
      } finally { checking = false; }
    }, 3000);
    return () => { active = false; clearInterval(t); };
  }, [tender.id, tender.summaryBusy]);

  async function refreshSummary() {
    setBusy(true);
    setError('');
    try {
      const d = await api(`/api/desk/tenders/${tender.id}/summary`, { method: 'POST', json: {} });
      setLive(d.summary);
      setBusy(false);
      onDone();
    } catch (err) {
      setError(err.message || 'The summary could not be refreshed.');
      setBusy(false);
    }
  }

  async function tick(itemId, ticked) {
    setTicks((current) => ({ ...current, [itemId]: ticked }));
    try {
      await api(`/api/desk/tenders/${tender.id}/checklist`, { method: 'PATCH', json: { itemId, ticked } });
      onDone();
    } catch (err) {
      setTicks((current) => {
        const next = { ...current };
        delete next[itemId];
        return next;
      });
      setError(err.message || 'The line could not be ticked.');
    }
  }

  async function addLine(e) {
    e.preventDefault();
    const form = new FormData(e.target);
    await api(`/api/desk/tenders/${tender.id}/checklist`, { method: 'POST', json: { label: form.get('label'), mandatory: form.get('mandatory') } });
    e.target.reset();
    onDone();
  }

  const sections = live?.sections || [];
  const unreadables = sections.find((s) => s.key === 'unreadable');

  return (
    <Card
      title="Document requirements"
      action={
        <Button variant="secondary" disabled={busy} onClick={refreshSummary}>
          Refresh the summary
        </Button>
      }
    >
      {busy ? <WaitStatus className="mb-3" title="Preparing your document requirements" detail="Gemini is reviewing the available document text to draft eligibility, required documents and a checklist. Your original files are already saved." slow="Large tender packets take longer to review. You can return to this tender later; review the draft against the official documents before bidding." /> : null}
      {error ? <p className="mb-3 text-sm text-red-700">{error}</p> : null}
      {!live && !busy ? (
        <p className="text-sm text-ink-600">Select this tender to write the summary, or press Refresh the summary.</p>
      ) : null}
      {summaryOutdated && !busy ? <WarnBox>Files were added after this summary. Refresh it to include the latest requirements and corrigenda.</WarnBox> : null}
      {live?.note ? <p className="mb-3 text-xs text-ink-500">{live.note}</p> : null}
      {tender.summaryAt ? <p className="mb-3 text-xs text-ink-400">Written {formatIST(tender.summaryAt)} over {JSON.parse(tender.summaryFiles || '[]').join(', ') || 'the form'}.</p> : null}
      {sections.map((s) => (
        <div key={s.key} className="mb-3">
          <h3 className="text-sm font-semibold text-ink-900">{s.title}</h3>
          {s.text ? <p className="whitespace-pre-wrap text-sm text-ink-700">{s.text}</p> : null}
          {s.items?.length ? (
            <ul className="mt-1 list-disc pl-5 text-sm">
              {s.items.map((it, i) => (
                <li key={i}>
                  {it.label.replace(/\s*\(mandatory\)\s*/gi,' ').trim()} {it.mandatory ? <span className="text-xs text-red-800">(mandatory)</span> : null}
                  {it.file?<span className="ml-1 text-xs text-ink-500">({it.file})</span>:null}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ))}
      {unreadables && live && !sections.some((s) => s.key !== 'unreadable' && s.text && s.text !== 'Not found in the uploaded documents.') && live.via === 'rules' ? (
        <p className="text-sm text-ink-600">Upload a text PDF or type the requirements. The summary does not guess.</p>
      ) : null}

      <div className="mt-4 border-t border-ink-100 pt-3">
        <h3 className="mb-2 text-sm font-semibold">Checklist</h3>
        <ul className="space-y-1">
          {tender.checklist.map((c) => {
            const ticked = Object.prototype.hasOwnProperty.call(ticks, c.id)
              ? ticks[c.id]
              : c.ticks.some((t) => t.personId === person.id);
            return (
              <li key={c.id} className="flex items-start gap-2 text-sm">
                <input type="checkbox" className="mt-1" checked={ticked} onChange={(e) => tick(c.id, e.target.checked)} />
                <span>
                  {c.label.replace(/\s*\(mandatory\)\s*/gi, ' ').trim()} {c.mandatory ? <span className="text-xs text-red-800">(mandatory)</span> : null}
                  <span className="ml-2 text-[11px] uppercase text-ink-400">{c.section}</span>
                </span>
              </li>
            );
          })}
        </ul>
        <form onSubmit={addLine} className="mt-3 flex flex-wrap gap-2">
          <input name="label" required placeholder="Add a line" className={inputClass('max-w-sm')} />
          <label className="flex items-center gap-1 text-xs">
            <input type="checkbox" name="mandatory" /> mandatory
          </label>
          <Button type="submit" variant="secondary">
            Add
          </Button>
        </form>
      </div>
    </Card>
  );
}

function StageBlock({ tender, person, canBidder, canAccounts, onDone }) {
  const [error, setError] = useState('');
  const [gotOpen, setGotOpen] = useState(false);

  async function setStage(stage, extra = {}) {
    setError('');
    try {
      const form = extra instanceof FormData ? extra : new FormData();
      if (!(extra instanceof FormData)) {
        form.set('stage', stage);
        for (const [k, v] of Object.entries(extra)) form.set(k, v);
      } else {
        form.set('stage', stage);
      }
      await api(`/api/desk/tenders/${tender.id}/stage`, { method: 'POST', form });
      setGotOpen(false);
      onDone();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <Card title={`Stage: ${STAGE_LABEL[tender.stage] || tender.stage}`}>
      <ErrorBox>{error}</ErrorBox>
      <div className="flex flex-wrap gap-2">
        {canBidder && ['UPLOADED', 'SELECTED'].includes(tender.stage) ? (
          <Button variant="secondary" onClick={() => setStage('PREPARING_BID')}>
            Preparing bid
          </Button>
        ) : null}
        {canBidder && ['UPLOADED', 'SELECTED', 'PREPARING_BID'].includes(tender.stage) ? (
          <Button onClick={() => setStage('BID_SUBMITTED')}>Mark bid submitted</Button>
        ) : null}
        {canBidder && ['UPLOADED', 'SELECTED', 'PREPARING_BID', 'BID_SUBMITTED'].includes(tender.stage) ? (
          <Button variant="secondary" onClick={() => setStage('NOT_AWARDED')}>
            Not awarded
          </Button>
        ) : null}
        {canBidder && tender.stage === 'BID_SUBMITTED' ? (
          <Button onClick={() => setGotOpen(true)}>Got the bid</Button>
        ) : null}
        {(canBidder || canAccounts) && tender.stage === 'GOT_THE_BID' ? (
          <Button variant="secondary" onClick={() => setStage('IN_EXECUTION')}>
            In execution
          </Button>
        ) : null}
        {canAccounts && ['SD_RELEASED', 'COMPLETED', 'NOT_AWARDED'].includes(tender.stage) ? (
          <Button variant="secondary" onClick={() => setStage('CLOSED')}>
            Closed
          </Button>
        ) : null}
      </div>
      {gotOpen ? (
        <form
          className="mt-4 grid max-w-xl gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            const form = new FormData(e.target);
            form.set('stage', 'GOT_THE_BID');
            setStage('GOT_THE_BID', form);
          }}
        >
          <Field label="Date of the letter of acceptance or work order" required>
            <input name="awardDate" type="date" required className={inputClass()} />
          </Field>
          <Field label="Awarded value (₹)" required>
            <input name="awardedValue" defaultValue={tender.estimatedValue ?? ''} required className={inputClass()} />
          </Field>
          <Field label="File type" required>
            <select name="letterType" className={inputClass()}>
              <option>Letter of acceptance</option>
              <option>Work order</option>
            </select>
          </Field>
          <Field label="Letter file" required>
            <input name="file" type="file" required accept=".pdf,image/*" className={inputClass()} />
          </Field>
          <Button type="submit">Save Got the bid</Button>
        </form>
      ) : null}
    </Card>
  );
}

function MoneyBlock({ tender, person, canAccounts, converted, categoryFilter, onDone }) {
  const [adding, setAdding] = useState(false);
  const [editId, setEditId] = useState(null);
  const list = categoryFilter ? tender.instruments.filter((i) => i.category === categoryFilter) : tender.instruments;
  const emdHeld = heldTotal(tender.instruments, 'EMD');
  const sdHeld = heldTotal(tender.instruments, 'SD');

  return (
    <div className="space-y-3">
      {!categoryFilter ? (
        <p className="text-sm tabular">
          EMD held {formatINR(emdHeld)} · Security Deposit held {formatINR(sdHeld)}
          {converted.length ? ' · A converted EMD is counted on the Security Deposit, not twice.' : ''}
        </p>
      ) : null}
      {list.length ? (
        <ul className="divide-y divide-ink-100 text-sm">
          {list.map((i) => (
            <li key={i.id} className="py-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{i.category === 'SD' ? 'Security Deposit' : 'EMD'}</span>
                <span>{i.form}</span>
                <span className="tabular">{formatINR(i.amount)}</span>
                <span>{i.number}</span>
                <StatusBadge status={i.status} />
                {canAccounts ? (
                  <Button variant="ghost" onClick={() => setEditId(i.id)}>
                    Correct
                  </Button>
                ) : null}
              </div>
              <p className="text-xs text-ink-500">
                {i.bank}
                {i.expiryDate ? ` · expires ${formatISTDate(i.expiryDate)}` : ''}
                {i.form === 'Bank guarantee' && nextExpiryReminder(i.expiryDate) ? ` · next reminder ${formatIST(nextExpiryReminder(i.expiryDate))}` : ''}
                {i.refundOfficeName ? ` · refund office ${i.refundOfficeName}` : ''}
                {i.status === 'CONVERTED_TO_SD' ? ' · converted to SD (not held)' : ''}
                {!i.proofDocumentId ? ' · proof not attached' : ''}
              </p>
                  {editId === i.id ? (
                    <InstrumentForm
                      tender={tender}
                      instrument={i}
                      canEdit={canAccounts}
                      onDone={() => {
                        setEditId(null);
                        onDone();
                      }}
                    />
                  ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-ink-500">No instruments yet.</p>
      )}
      {canAccounts && !adding ? (
        <Button variant="secondary" onClick={() => setAdding(true)}>
          Add instrument
        </Button>
      ) : null}
      {adding ? (
        <InstrumentForm
          tender={tender}
          canEdit={canAccounts}
          onDone={() => {
            setAdding(false);
            onDone();
          }}
        />
      ) : null}
    </div>
  );
}

function NoticeRecord({ tender }) {
  const facts = readNoticeFacts({
    documents: tender.documents || [],
    applications: tender.applications || [],
    instruments: tender.instruments || [],
    tender,
  });
  return (
    <Card title="From the uploaded documents">
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <Item label="Department" value={facts.department || NOT_AVAILABLE} />
        <Item label="Experience" value={facts.experience.length ? facts.experience.join(', ') : 'Not in the uploaded documents'} />
        <Item label="Eligibility in the files" value={facts.eligibility.length ? facts.eligibility.join(' ') : 'Not in the uploaded documents'} />
        <Item label="Bid postponed" value={facts.postponements.length ? facts.postponements.map((item) => item.line).join(' ') : 'Not in the uploaded documents'} />
        <Item label="Extension" value={facts.extensions.length ? facts.extensions.map((item) => item.line).join(' ') : 'Not in the uploaded documents'} />
        <Item label="EMD still held" value={facts.emdHeld > 0 ? formatINR(facts.emdHeld) : 'None held'} />
        <Item label="Security deposit still held" value={facts.sdHeld > 0 ? formatINR(facts.sdHeld) : 'None held'} />
        <Item
          label="Completion certificate"
          value={facts.completion.length ? facts.completion.map((file) => file.fileName).join(', ') : 'Not uploaded'}
        />
        <Item
          label="Money return"
          value={facts.refunds.length
            ? facts.refunds.map((refund) => `${refund.kind} ${refund.status}${refund.officeName ? ` · ${refund.officeName}` : ''}${refund.sentOn ? ` · sent ${formatISTDate(refund.sentOn)}` : ''}`).join('; ')
            : 'No refund application'}
        />
      </dl>
      {facts.completion.length ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {facts.completion.map((file) => (
            <a key={file.id} className="d-pill" href={`/api/desk/documents/${file.id}?download=1`} download={file.fileName}>
              <FileTypeIcon fileName={file.fileName} mime={file.mime} size={16} /> {file.fileName}
            </a>
          ))}
        </div>
      ) : null}
    </Card>
  );
}

function CompletionBlock({ tender, onDone }) {
  const [error, setError] = useState('');
  const [editing,setEditing]=useState(false);
  const [busy, setBusy] = useState(false);
  const hasCert = tender.documents.some((d) => d.type === 'Completion certificate');

  async function save(e) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await api(`/api/desk/tenders/${tender.id}/completion`, { method: 'POST', form: new FormData(e.target) });
      setEditing(false);
      onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (tender.completionDate && hasCert && !editing) {
    return (
      <div className="mt-4 rounded bg-ink-50 p-3 text-sm">
        <p className="font-medium">Completion</p>
        <p>
          Certificate {tender.completionCertNo || '—'} dated {formatISTDate(tender.completionDate)}
          {tender.completionAuthority ? ` · ${tender.completionAuthority}` : ''}
        </p>
        <p>SD eligible from: {tender.sdReleaseEligibleAt?formatISTDate(tender.sdReleaseEligibleAt):'Review the contract before applying'}</p>
        {tender.sdReleaseConditions?<p>{tender.sdReleaseConditions}</p>:null}
        <Button variant="secondary" onClick={()=>setEditing(true)}>Edit completion and release terms</Button>
      </div>
    );
  }

  return (
    <form onSubmit={save} className="mt-4 grid max-w-xl gap-3 rounded border border-ink-200 p-3">
      <p className="text-sm font-medium">Completion</p>
      <ErrorBox>{error}</ErrorBox>
      <Field label="Completion certificate" required>
        <input name="file" type="file" required={!hasCert} accept=".pdf,image/*" className={inputClass()} />
      </Field>
      <Field label="Certificate number">
        <input name="certNo" defaultValue={tender.completionCertNo || ''} className={inputClass()} />
      </Field>
      <Field label="Completion date" required hint="The date on the certificate, not the date of upload.">
        <input name="completionDate" type="date" required defaultValue={toInputDate(tender.completionDate)} className={inputClass()} />
      </Field>
      <Field label="Issuing authority">
        <input name="authority" defaultValue={tender.completionAuthority || ''} className={inputClass()} />
      </Field>
      <Field label="Note">
        <input name="note" defaultValue={tender.completionNote || ''} className={inputClass()} />
      </Field>
      <Field label="SD release eligibility date" hint="From the contract, including any defect-liability period. Leave blank if not confirmed.">
        <input name="sdReleaseEligibleAt" type="date" defaultValue={toInputDate(tender.sdReleaseEligibleAt)} className={inputClass()} />
      </Field>
      <Field label="SD release conditions">
        <input name="sdReleaseConditions" defaultValue={tender.sdReleaseConditions || ''} className={inputClass()} />
      </Field>
      <Button type="submit" disabled={busy}>{busy ? 'Saving completion…' : 'Save completion'}</Button>
    </form>
  );
}

function ApplyBlock({ kind, tender, gate, canAccounts }) {
  const router = useRouter();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const label = kind === 'EMD' ? 'Apply for EMD refund' : 'Apply for security money';

  async function go() {
    setBusy(true);
    setError('');
    try {
      const d = await api(`/api/desk/tenders/${tender.id}/applications`, { method: 'POST', json: { kind } });
      router.push(`/tenders/desk/applications/${d.applicationIds[0]}`);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 space-y-2">
      <Button disabled={!gate.enabled || !canAccounts || busy} onClick={go}>
        {busy ? 'Preparing application…' : label}
      </Button>
      {!gate.enabled ? (
        <ul className="list-disc pl-5 text-sm text-ink-700">
          {gate.missing.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      ) : null}
      {kind === 'SD' && !canAccounts ? <p className="text-xs text-ink-500">Accounts files the application.</p> : null}
      <ErrorBox>{error}</ErrorBox>
    </div>
  );
}
