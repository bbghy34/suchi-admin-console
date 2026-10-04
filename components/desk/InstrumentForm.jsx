'use client';

import { useState } from 'react';
import { api } from '@/components/desk/api';
import { Button, ErrorBox, Field, WarnBox, inputClass } from '@/components/desk/ui';
import { ALL_STATES, INSTRUMENT_FORMS, INSTRUMENT_STATUSES } from '@/lib/desk/constants';
import { suggestOfficeName } from '@/lib/desk/money';
import { toInputDate } from '@/lib/desk/ist';

export function InstrumentForm({ tender, instrument, onDone, canEdit }) {
  const editing = !!instrument;
  const [category, setCategory] = useState(instrument?.category || '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(instrument?.form || 'Demand draft');
  const [status, setStatus] = useState(instrument?.status || 'TO_ARRANGE');
  const [proofMissing, setProofMissing] = useState(!instrument?.proofDocumentId);
  const prefill = suggestOfficeName(tender.orgChain);

  const [f, setF] = useState({
    amount: instrument?.amount ?? '',
    inFavourOf: instrument?.inFavourOf || '',
    bank: instrument?.bank || '',
    branch: instrument?.branch || '',
    number: instrument?.number || '',
    instrumentDate: toInputDate(instrument?.instrumentDate),
    expiryDate: toInputDate(instrument?.expiryDate),
    submittedOn: toInputDate(instrument?.submittedOn),
    submittedToName: instrument?.submittedToName || '',
    submittedToDept: instrument?.submittedToDept || '',
    submittedToDistrict: instrument?.submittedToDistrict || '',
    submittedToState: instrument?.submittedToState || '',
    note: instrument?.note || '',
    convertedToId: instrument?.convertedToId || '',
    refundOfficeName: instrument?.refundOfficeName || (instrument ? '' : prefill),
    refundOfficeDept: instrument?.refundOfficeDept || '',
    refundOfficeAddress: instrument?.refundOfficeAddress || '',
    refundOfficeDistrict: instrument?.refundOfficeDistrict || '',
    refundOfficeState: instrument?.refundOfficeState || tender.state || tender.placeOfWorkState || '',
    refundOfficerName: instrument?.refundOfficerName || '',
    refundOfficePhone: instrument?.refundOfficePhone || '',
    refundOfficeEmail: instrument?.refundOfficeEmail || '',
    refundedOn: toInputDate(instrument?.refundedOn),
  });

  function set(k, v) {
    setF((p) => ({ ...p, [k]: v }));
  }

  async function save(e) {
    e.preventDefault();
    if (!canEdit) return;
    setBusy(true);
    setError('');
    try {
      const data = new FormData();
      data.set('category', category);
      data.set('form', form);
      data.set('status', status);
      for (const [k, v] of Object.entries(f)) {
        data.set(k, v == null ? '' : String(v));
      }
      const proof = e.target.proof?.files?.[0];
      if (proof) data.set('proof', proof);
      else setProofMissing(true);
      if (editing) await api(`/api/desk/instruments/${instrument.id}`, { method: 'PATCH', form: data });
      else await api(`/api/desk/tenders/${tender.id}/instruments`, { method: 'POST', form: data });
      onDone();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  if (!category) {
    return (
      <div className="space-y-3 rounded border border-ink-200 p-3">
        <p className="text-sm font-medium">Choose the category first.</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <button type="button" className="rounded border border-ink-300 p-3 text-left hover:bg-desk-light" onClick={() => setCategory('EMD')}>
            <span className="block font-semibold">EMD</span>
            <span className="text-xs text-ink-600">Earnest money lodged with the bid. It may already have been paid before the award. Enter it now if it was not entered earlier.</span>
          </button>
          <button type="button" className="rounded border border-ink-300 p-3 text-left hover:bg-desk-light" onClick={() => setCategory('SD')}>
            <span className="block font-semibold">Security Deposit</span>
            <span className="text-xs text-ink-600">Performance security lodged because the firm got the bid. This is the amount the firm will ask back after completion.</span>
          </button>
        </div>
      </div>
    );
  }

  const sdSiblings = (tender.instruments || []).filter((i) => i.category === 'SD' && i.id !== instrument?.id);

  return (
    <form onSubmit={save} className="space-y-3 rounded border border-ink-200 p-3">
      <ErrorBox>{error}</ErrorBox>
      <p className="text-sm font-semibold">{category === 'SD' ? 'Security Deposit' : 'EMD'}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Form" required>
          <select className={inputClass()} value={form} onChange={(e) => setForm(e.target.value)}>
            {INSTRUMENT_FORMS.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </Field>
        <Field label="Status" required>
          <select className={inputClass()} value={status} onChange={(e) => setStatus(e.target.value)}>
            {INSTRUMENT_STATUSES.map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Amount (₹)" required>
          <input className={inputClass()} value={f.amount} onChange={(e) => set('amount', e.target.value)} />
        </Field>
        <Field label="In whose favour">
          <input className={inputClass()} value={f.inFavourOf} onChange={(e) => set('inFavourOf', e.target.value)} />
        </Field>
        <Field label="Bank">
          <input className={inputClass()} value={f.bank} onChange={(e) => set('bank', e.target.value)} />
        </Field>
        <Field label="Branch">
          <input className={inputClass()} value={f.branch} onChange={(e) => set('branch', e.target.value)} />
        </Field>
        <Field label="Instrument number">
          <input className={inputClass()} value={f.number} onChange={(e) => set('number', e.target.value)} />
        </Field>
        <Field label="Instrument date">
          <input type="date" className={inputClass()} value={f.instrumentDate} onChange={(e) => set('instrumentDate', e.target.value)} />
        </Field>
        {form === 'Bank guarantee' ? (
          <Field label="Expiry date" required>
            <input type="date" className={inputClass()} value={f.expiryDate} onChange={(e) => set('expiryDate', e.target.value)} />
          </Field>
        ) : null}
        <Field label="Submitted on">
          <input type="date" className={inputClass()} value={f.submittedOn} onChange={(e) => set('submittedOn', e.target.value)} />
        </Field>
        <Field label="Office it was submitted to">
          <input className={inputClass()} value={f.submittedToName} onChange={(e) => set('submittedToName', e.target.value)} />
        </Field>
        <Field label="Department">
          <input className={inputClass()} value={f.submittedToDept} onChange={(e) => set('submittedToDept', e.target.value)} />
        </Field>
        <Field label="District">
          <input className={inputClass()} value={f.submittedToDistrict} onChange={(e) => set('submittedToDistrict', e.target.value)} />
        </Field>
        <Field label="State">
          <select className={inputClass()} value={f.submittedToState} onChange={(e) => set('submittedToState', e.target.value)}>
            <option value="">Pick</option>
            {ALL_STATES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </Field>
        {status === 'CONVERTED_TO_SD' ? (
          <Field label="Converted to this Security Deposit" required className="sm:col-span-2">
            <select className={inputClass()} value={f.convertedToId} onChange={(e) => set('convertedToId', e.target.value)}>
              <option value="">Pick the new Security Deposit</option>
              {sdSiblings.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.number || i.id} · {i.form} · {i.amount}
                </option>
              ))}
            </select>
          </Field>
        ) : null}
        {status === 'REFUNDED' ? (
          <Field label="Refunded on">
            <input type="date" className={inputClass()} value={f.refundedOn} onChange={(e) => set('refundedOn', e.target.value)} />
          </Field>
        ) : null}
        <Field label="Note" className="sm:col-span-2">
          <textarea className={inputClass()} value={f.note} onChange={(e) => set('note', e.target.value)} />
        </Field>
        <Field label="Proof file" className="sm:col-span-2">
          <input name="proof" type="file" accept=".pdf,image/*,.txt" className={inputClass()} />
        </Field>
      </div>
      {proofMissing ? <WarnBox>Proof is not attached yet. You can save now and attach it later.</WarnBox> : null}

      <div className="rounded bg-ink-50 p-3">
        <p className="mb-2 text-sm font-medium">
          {category === 'SD' ? 'Office we will get this Security Deposit back from.' : 'Refund office (optional for EMD; used if the bid is not awarded).'}
        </p>
        {category === 'SD' && prefill && !editing ? (
          <p className="mb-2 text-xs text-ink-500">Prefilling the office name from the last part of the organisation chain. Confirm or change it.</p>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Office name" required={category === 'SD'}>
            <input className={inputClass()} value={f.refundOfficeName} onChange={(e) => set('refundOfficeName', e.target.value)} />
          </Field>
          <Field label="Department">
            <input className={inputClass()} value={f.refundOfficeDept} onChange={(e) => set('refundOfficeDept', e.target.value)} />
          </Field>
          <Field label="Address" className="sm:col-span-2">
            <input className={inputClass()} value={f.refundOfficeAddress} onChange={(e) => set('refundOfficeAddress', e.target.value)} />
          </Field>
          <Field label="District">
            <input className={inputClass()} value={f.refundOfficeDistrict} onChange={(e) => set('refundOfficeDistrict', e.target.value)} />
          </Field>
          <Field label="State">
            <select className={inputClass()} value={f.refundOfficeState} onChange={(e) => set('refundOfficeState', e.target.value)}>
              <option value="">Pick</option>
              {ALL_STATES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </Field>
          <Field label="Officer’s name">
            <input className={inputClass()} value={f.refundOfficerName} onChange={(e) => set('refundOfficerName', e.target.value)} />
          </Field>
          <Field label="Phone (optional)">
            <input className={inputClass()} value={f.refundOfficePhone} onChange={(e) => set('refundOfficePhone', e.target.value)} />
          </Field>
          <Field label="Email (optional)">
            <input className={inputClass()} value={f.refundOfficeEmail} onChange={(e) => set('refundOfficeEmail', e.target.value)} />
          </Field>
        </div>
      </div>

      {canEdit ? (
        <div className="flex gap-2">
          <Button type="submit" disabled={busy}>
            {busy ? 'Saving…' : 'Save instrument'}
          </Button>
          <Button type="button" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        </div>
      ) : (
        <p className="text-sm text-ink-500">A bidder can see this section but cannot edit instruments unless they also have the Accounts role.</p>
      )}
    </form>
  );
}
