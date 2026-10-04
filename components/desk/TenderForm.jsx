'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/components/desk/api';
import { Button, ErrorBox, Field, WarnBox, inputClass } from '@/components/desk/ui';
import { ALL_STATES, DOCUMENT_TYPES, EMD_MODES, isCentralSource, NE_STATES, TENDER_CATEGORIES } from '@/lib/desk/constants';
import { toInputDateTime } from '@/lib/desk/ist';
import { collectUploadProblems } from '@/lib/desk/upload-checks';

const FILE_ACCEPT = '.pdf,.doc,.docx,.rtf,.xls,.xlsx,.csv,.txt,.jpg,.jpeg,.png,.webp,.heic,.heif,.gif,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,image/*';

function emptyFile() {
  return { file: null, type: 'NIT', date: '' };
}

export function TenderForm({ sources, workCategories, initial, sourceId, person }) {
  const router = useRouter();
  const editing = !!initial;
  const [error, setError] = useState('');
  const [problems, setProblems] = useState([]);
  const [similar, setSimilar] = useState(null);
  const [existingId, setExistingId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [anyway, setAnyway] = useState(!!initial?.uploadAnywayReason);
  const [files, setFiles] = useState(editing ? [] : [emptyFile()]);

  const [f, setF] = useState(() => {
    const start = sources.find((s) => s.id === (initial?.sourceId || sourceId));
    return {
    sourceId: initial?.sourceId || sourceId || '',
    title: initial?.title || '',
    allIndia: initial ? !!initial.allIndia : !!start?.allIndia,
    state: initial?.state || (start?.allIndia ? '' : start?.state || ''),
    placeOfWork: initial?.placeOfWork || '',
    placeOfWorkState: initial?.placeOfWorkState || '',
    portalTenderId: initial?.portalTenderId || '',
    referenceNo: initial?.referenceNo || '',
    orgChain: initial?.orgChain || '',
    category: initial?.category || 'Works',
    workCategory: initial?.workCategory || '',
    scheme: initial?.scheme === 'PMGSY' ? 'PMGSY' : initial?.scheme ? 'other' : 'none',
    schemeOther: initial?.scheme && initial.scheme !== 'PMGSY' ? initial.scheme : '',
    estimatedValue: initial?.estimatedValue ?? '',
    emdAmount: initial?.emdAmount ?? '',
    emdMode: initial?.emdMode || '',
    tenderFee: initial?.tenderFee ?? '',
    publishedAt: toInputDateTime(initial?.publishedAt),
    docSaleEnd: toInputDateTime(initial?.docSaleEnd),
    bidSubmissionEnd: toInputDateTime(initial?.bidSubmissionEnd),
    bidOpeningAt: toInputDateTime(initial?.bidOpeningAt),
    bidOpeningPlace: initial?.bidOpeningPlace || '',
    preBidAt: toInputDateTime(initial?.preBidAt),
    preBidPlace: initial?.preBidPlace || '',
    periodOfWorkDays: initial?.periodOfWorkDays ?? '',
    bidValidityDays: initial?.bidValidityDays ?? '',
    location: initial?.location || '',
    district: initial?.district || '',
    pinCode: initial?.pinCode || '',
    nodalOfficer: initial?.nodalOfficer || '',
    nodalPhone: initial?.nodalPhone || '',
    sourceUrl: initial?.sourceUrl || '',
    description: initial?.description || '',
    searchKeywords: initial?.searchKeywords ? String(initial.searchKeywords).split(',').join(', ') : '',
    gemBidNumber: initial?.gemBidNumber || '',
    gemBuyer: initial?.gemBuyer || '',
    gemConsigneeState: initial?.gemConsigneeState || '',
    gemRa: initial?.gemRa || '',
    uploadAnywayReason: initial?.uploadAnywayReason || '',
  };
  });

  const source = useMemo(() => sources.find((s) => s.id === f.sourceId), [sources, f.sourceId]);
  const isGem = source?.kind === 'GEM';
  const outsideCategory = f.workCategory && workCategories.length && !workCategories.includes(f.workCategory);

  function set(key, value) {
    setF((prev) => {
      const next = { ...prev, [key]: value };
      if (key === 'sourceId') {
        const s = sources.find((x) => x.id === value);
        if (s?.url && !prev.sourceUrl) next.sourceUrl = s.url;
        if (s?.allIndia) {
          next.allIndia = true;
          next.state = '';
        } else if (s) {
          next.allIndia = false;
          if (s.state) next.state = s.state;
        }
      }
      return next;
    });
  }

  function appendForm(form, keepBoth = false) {
    for (const [k, v] of Object.entries(f)) {
      if (v === true || v === false) form.set(k, v ? 'true' : 'false');
      else if (v != null && v !== '') form.set(k, String(v));
    }
    form.set('allIndia', f.allIndia ? 'true' : 'false');
    if (keepBoth) form.set('keepBoth', 'true');
    files.forEach((file, i) => {
      if (file.file) {
        form.append('file', file.file);
        form.append('fileType', file.type);
        form.append('fileDate', file.date);
      }
    });
  }

  async function save(keepBoth = false) {
    const found = collectUploadProblems(f, {
      source,
      fileCount: files.filter((file) => file.file).length,
      hasExistingFiles: editing,
      workCategories,
    });
    if (found.length) {
      setProblems(found);
      setError(found[0]);
      setSimilar(null);
      setExistingId(null);
      return;
    }
    setBusy(true);
    setError('');
    setProblems([]);
    setSimilar(null);
    setExistingId(null);
    try {
      const form = new FormData();
      appendForm(form, keepBoth);
      const url = editing ? `/api/desk/tenders/${initial.id}` : '/api/desk/tenders';
      const data = await api(url, { method: editing ? 'PATCH' : 'POST', form });
      router.push(`/tenders/desk/tenders/${data.tenderId}`);
      router.refresh();
    } catch (err) {
      if (err.status === 409 && err.data?.duplicate === 'exact') {
        setExistingId(err.data.existingTenderId);
        setError(err.message);
      } else if (err.status === 409 && err.data?.duplicate === 'similar') {
        setSimilar(err.data.similar);
        setError(err.message);
      } else {
        setError(err.message);
        setProblems(err.data?.problems || []);
      }
      setBusy(false);
    }
  }

  async function linkSame(id) {
    setBusy(true);
    try {
      if (f.scheme === 'PMGSY' || source?.id === 'pmgsy') {
        await api(`/api/desk/tenders/${id}`, { method: 'PATCH', json: { onlyScheme: true, scheme: 'PMGSY' } });
      }
      router.push(`/tenders/desk/tenders/${id}`);
      router.refresh();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        save(false);
      }}
    >
      {problems.length ? (
        <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          <p className="font-medium">Fix these before saving.</p>
          <ul className="mt-1 list-disc pl-5">
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      ) : (
        <ErrorBox>{error}</ErrorBox>
      )}
      {existingId ? (
        <p className="text-sm">
          <a className="font-medium text-desk underline" href={`/tenders/desk/tenders/${existingId}`}>
            Open the existing tender
          </a>{' '}
          and add a document (usually a corrigendum).
        </p>
      ) : null}
      {similar?.length ? (
        <div className="space-y-2 rounded border border-amber-200 bg-amber-50 p-3 text-sm">
          <p>Another tender looks like the same notice. This is how PMGSY notices avoid becoming a second copy of a state tender.</p>
          {similar.map((s) => (
            <div key={s.id} className="flex flex-wrap items-center gap-2">
              <a className="underline" href={`/tenders/desk/tenders/${s.id}`}>
                {s.title}
              </a>
              <span className="text-xs text-ink-600">{s.reasons?.join('; ')}</span>
              <Button type="button" variant="secondary" onClick={() => linkSame(s.id)}>
                Link as the same tender
              </Button>
            </div>
          ))}
          <Button type="button" onClick={() => save(true)}>
            Keep both
          </Button>
        </div>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2">
        <Field label="Source" required className="sm:col-span-2">
          <select className={inputClass()} value={f.sourceId} onChange={(e) => set('sourceId', e.target.value)} required>
            <option value="">Pick a source</option>
            {sources.filter((s) => s.kind !== 'PLATFORM' || s.id === f.sourceId).map((s) => (
              <option key={s.id} value={s.id}>
                {s.displayName}
              </option>
            ))}
          </select>
          {source ? <span className="mt-1 block text-xs text-ink-500">{source.intakeRule}</span> : null}
          {source && isCentralSource(source.id) ? (
            <span className="tender-central-note">Central tender. This row is marked differently from a state-portal tender.</span>
          ) : null}
        </Field>
        <Field label="Title" required className="sm:col-span-2">
          <input className={inputClass()} value={f.title} onChange={(e) => set('title', e.target.value)} required />
        </Field>
        <Field
          label="Search keywords"
          required={!editing}
          className="sm:col-span-2"
          hint="Comma-separated. These words are the keyword filter on tender search. Example: solar, road, bridge."
        >
          <input
            className={inputClass()}
            value={f.searchKeywords}
            onChange={(e) => set('searchKeywords', e.target.value)}
            placeholder="solar, road, bridge"
            required={!editing}
          />
        </Field>
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input type="checkbox" checked={f.allIndia} onChange={(e) => set('allIndia', e.target.checked)} />
          All India (give a place of work)
        </label>
        {!f.allIndia ? (
          <Field label="State" required>
            <select className={inputClass()} value={f.state} onChange={(e) => set('state', e.target.value)} required>
              <option value="">Pick a state</option>
              {ALL_STATES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>
        ) : (
          <>
            <Field label="Place of work" required>
              <input className={inputClass()} value={f.placeOfWork} onChange={(e) => set('placeOfWork', e.target.value)} required />
            </Field>
            <Field label="Place of work state">
              <select className={inputClass()} value={f.placeOfWorkState} onChange={(e) => set('placeOfWorkState', e.target.value)}>
                <option value="">Pick if known</option>
                {ALL_STATES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </Field>
          </>
        )}
        <Field label="Bid submission end" required>
          <input type="datetime-local" className={inputClass()} value={f.bidSubmissionEnd} onChange={(e) => set('bidSubmissionEnd', e.target.value)} required />
        </Field>
        <Field label="Estimated value (₹)" hint="Optional. Used by the amount filter.">
          <input className={inputClass()} inputMode="decimal" value={f.estimatedValue} onChange={(e) => set('estimatedValue', e.target.value)} placeholder="3400000" />
        </Field>
        <Field label="Short description" className="sm:col-span-2">
          <textarea className={inputClass('min-h-[72px]')} value={f.description} onChange={(e) => set('description', e.target.value)} />
        </Field>
      </section>

      {isGem ? (
        <section className="grid gap-4 rounded-lg border border-ink-200 p-4 sm:grid-cols-2">
          <h2 className="sm:col-span-2 text-sm font-semibold">GeM bid</h2>
          <Field label="Bid number" required>
            <input className={inputClass()} value={f.gemBidNumber} onChange={(e) => set('gemBidNumber', e.target.value)} required />
          </Field>
          <Field label="Buyer" required>
            <input className={inputClass()} value={f.gemBuyer} onChange={(e) => set('gemBuyer', e.target.value)} required />
          </Field>
          <Field label="Consignee state" required hint={`Kept only for ${NE_STATES.join(', ')}.`}>
            <select className={inputClass()} value={f.gemConsigneeState} onChange={(e) => set('gemConsigneeState', e.target.value)} required>
              <option value="">Pick</option>
              {ALL_STATES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>
          <Field label="RA if any">
            <input className={inputClass()} value={f.gemRa} onChange={(e) => set('gemRa', e.target.value)} />
          </Field>
        </section>
      ) : (
        <section className="grid gap-4 sm:grid-cols-2">
          <Field label="Tender id" className="sm:col-span-2">
            <input className={inputClass()} value={f.portalTenderId} onChange={(e) => set('portalTenderId', e.target.value)} />
          </Field>
        </section>
      )}

      <details className="rounded-lg border border-ink-200 bg-white p-4" open={editing || undefined}>
        <summary className="cursor-pointer text-sm font-semibold text-ink-900">More details</summary>
        {!editing ? <p className="mb-3 mt-1 text-xs text-ink-500">Optional. Fill these when the notice prints them. They can be added later from Edit tender.</p> : <div className="mb-3" />}
        <div className="grid gap-4 sm:grid-cols-2">
        {!isGem ? (
          <>
            <Field label="Reference number / NIT number">
              <input className={inputClass()} value={f.referenceNo} onChange={(e) => set('referenceNo', e.target.value)} />
            </Field>
            <Field label="Organisation chain" className="sm:col-span-2" hint="Department, zone, circle, division — copy it as printed.">
              <input className={inputClass()} value={f.orgChain} onChange={(e) => set('orgChain', e.target.value)} />
            </Field>
          </>
        ) : null}
        <Field label="Category">
          <select className={inputClass()} value={f.category} onChange={(e) => set('category', e.target.value)}>
            <option value="">Pick</option>
            {TENDER_CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
        <Field label="Work category">
          <input className={inputClass()} list="work-cats" value={f.workCategory} onChange={(e) => set('workCategory', e.target.value)} />
          <datalist id="work-cats">
            {workCategories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Field>
        {outsideCategory || anyway ? (
          <div className="sm:col-span-2 space-y-2">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={anyway} onChange={(e) => setAnyway(e.target.checked)} />
              Upload anyway
            </label>
            {anyway ? (
              <Field label="One-line reason" required>
                <input className={inputClass()} value={f.uploadAnywayReason} onChange={(e) => set('uploadAnywayReason', e.target.value)} />
              </Field>
            ) : (
              <WarnBox>That work category is outside the firm’s list. Choose Upload anyway and give a one-line reason, or pick a listed category.</WarnBox>
            )}
          </div>
        ) : null}
        <Field label="Scheme">
          <select className={inputClass()} value={f.scheme} onChange={(e) => set('scheme', e.target.value)}>
            <option value="none">None</option>
            <option value="PMGSY">PMGSY</option>
            <option value="other">Other</option>
          </select>
        </Field>
        {f.scheme === 'other' ? (
          <Field label="Scheme name">
            <input className={inputClass()} value={f.schemeOther} onChange={(e) => set('schemeOther', e.target.value)} />
          </Field>
        ) : null}
        <Field label="EMD amount (₹)">
          <input className={inputClass()} value={f.emdAmount} onChange={(e) => set('emdAmount', e.target.value)} />
        </Field>
        <Field label="EMD form">
          <select className={inputClass()} value={f.emdMode} onChange={(e) => set('emdMode', e.target.value)}>
            <option value="">Not stated</option>
            {EMD_MODES.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </Field>
        <Field label="Tender fee (₹)">
          <input className={inputClass()} value={f.tenderFee} onChange={(e) => set('tenderFee', e.target.value)} />
        </Field>
        <Field label="Published date">
          <input type="datetime-local" className={inputClass()} value={f.publishedAt} onChange={(e) => set('publishedAt', e.target.value)} />
        </Field>
        <Field label="Document sale or download end">
          <input type="datetime-local" className={inputClass()} value={f.docSaleEnd} onChange={(e) => set('docSaleEnd', e.target.value)} />
        </Field>
        <Field label="Bid opening date">
          <input type="datetime-local" className={inputClass()} value={f.bidOpeningAt} onChange={(e) => set('bidOpeningAt', e.target.value)} />
        </Field>
        <Field label="Bid opening place">
          <input className={inputClass()} value={f.bidOpeningPlace} onChange={(e) => set('bidOpeningPlace', e.target.value)} />
        </Field>
        <Field label="Pre-bid meeting">
          <input type="datetime-local" className={inputClass()} value={f.preBidAt} onChange={(e) => set('preBidAt', e.target.value)} />
        </Field>
        <Field label="Pre-bid place">
          <input className={inputClass()} value={f.preBidPlace} onChange={(e) => set('preBidPlace', e.target.value)} />
        </Field>
        <Field label="Period of work (days)">
          <input className={inputClass()} value={f.periodOfWorkDays} onChange={(e) => set('periodOfWorkDays', e.target.value)} />
        </Field>
        <Field label="Bid validity (days)">
          <input className={inputClass()} value={f.bidValidityDays} onChange={(e) => set('bidValidityDays', e.target.value)} />
        </Field>
        <Field label="Location">
          <input className={inputClass()} value={f.location} onChange={(e) => set('location', e.target.value)} />
        </Field>
        <Field label="District">
          <input className={inputClass()} value={f.district} onChange={(e) => set('district', e.target.value)} />
        </Field>
        <Field label="Pin code">
          <input className={inputClass()} value={f.pinCode} onChange={(e) => set('pinCode', e.target.value)} />
        </Field>
        <Field label="Nodal officer name">
          <input className={inputClass()} value={f.nodalOfficer} onChange={(e) => set('nodalOfficer', e.target.value)} />
        </Field>
        <Field label="Nodal officer phone">
          <input className={inputClass()} value={f.nodalPhone} onChange={(e) => set('nodalPhone', e.target.value)} />
        </Field>
        <Field label="Source URL of this tender" className="sm:col-span-2">
          <input className={inputClass()} value={f.sourceUrl} onChange={(e) => set('sourceUrl', e.target.value)} />
        </Field>
        </div>
      </details>

      {!editing ? (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold">Document <span className="text-red-700">*</span></h2>
          <p className="text-xs text-ink-500">One file is required. PDF, Word, Excel, or a photo. Text is read from PDF, Word, Excel, and text files. A scanned photo is stored and not read.</p>
          {files.map((file, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-[1fr_10rem_9rem]">
              <input
                type="file"
                aria-label="Document file"
                accept={FILE_ACCEPT}
                className={inputClass()}
                onChange={(e) => {
                  const next = [...files];
                  next[i] = { ...next[i], file: e.target.files?.[0] || null };
                  setFiles(next);
                }}
              />
              <select
                aria-label="Document type"
                className={inputClass()}
                value={file.type}
                onChange={(e) => {
                  const next = [...files];
                  next[i] = { ...next[i], type: e.target.value };
                  setFiles(next);
                }}
              >
                {DOCUMENT_TYPES.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
              <input
                type="date"
                aria-label="Document date"
                className={inputClass()}
                value={file.date}
                onChange={(e) => {
                  const next = [...files];
                  next[i] = { ...next[i], date: e.target.value };
                  setFiles(next);
                }}
              />
            </div>
          ))}
          <Button type="button" variant="secondary" onClick={() => setFiles([...files, emptyFile()])}>
            Add another file
          </Button>
        </section>
      ) : null}

      <Button type="submit" disabled={busy}>
        {busy ? 'Saving…' : editing ? 'Save tender' : 'Save tender'}
      </Button>
    </form>
  );
}
