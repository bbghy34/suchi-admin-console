'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ClipboardList, Bookmark, Plus, Pencil, Trash2, ChevronLeft, ChevronRight, Search, Save, Upload, Bell, Download, ExternalLink, Loader2, Trophy, CircleX, Ban, Hourglass } from 'lucide-react';
import ModuleHeader from '@/components/layout/ModuleHeader';
import { FileTypeIcon, formatBytes } from '@/components/desk/FileTypeIcon';
import { DonutCard } from '@/components/tenders/MoneyChoiceCharts';
import { MONEY_MODE_OPTIONS, MONEY_THROUGH_OPTIONS } from '@/lib/daily-tenders';
import { MAX_DOC_MB, MAX_DOC_SIZE } from '@/lib/daily-tender-doc-upload';
import { useAuth } from '@/components/providers/AuthProvider';
import { useToast } from '@/components/providers/ToastProvider';
import Button from '@/components/ui/Button';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import Modal from '@/components/ui/Modal';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableLoadingState,
  TableEmptyState,
} from '@/components/ui/Table';

const fieldClass = 'mt-1 block w-full rounded-lg px-3 py-2 text-sm outline-none disabled:opacity-70';
const fieldStyle = {
  background: 'var(--md-sidebar)',
  border: '1px solid var(--md-border-strong)',
  color: 'var(--md-on)',
};

const emptyForm = {
  portalLink: '',
  ePublishedDate: '',
  closingDate: '',
  openingDate: '',
  titleAndRefNo: '',
  tenderId: '',
  organisationChain: '',
  tenderDetails: [],
  emdAmount: '',
  emdDoc: [],
  emdDate: '',
  emdMoneyOffice: '',
  emdThrough: '',
  emdMode: '',
  preQualification: '',
  tenderValue: '',
  tenderFee: '',
  productCategory: '',
  tenderDocs: [],
  sdMoney: '',
  sdDocs: [],
  sdIssueDate: '',
  sdExpireDate: '',
  sdMoneyOffice: '',
  sdThrough: '',
  sdMode: '',
  corrigendum: [],
  subCategory: '',
  tAck: [],
  isWin: '',
  status: 'pending',
};

function authHeaders(json = false) {
  const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (json) headers['Content-Type'] = 'application/json';
  return headers;
}

function fileList(value) {
  return Array.isArray(value) ? value : [];
}

const PORTAL_LINKS = [
  'https://www.assamtenders.gov.in/',
  'https://eprocure.gov.in/eprocure/app',
  'https://www.defproc.gov.in/nicgep/app',
  'https://www.pmgsytenders.gov.in/',
  'https://gepnic.gov.in/',
  'https://www.coalindiatenders.nic.in/nicgep/app',
  'https://eprocurentpc.nic.in/nicgep/app',
  'https://tenders.wb.gov.in/nicgep/app',
  'https://www.wbtenders.gov.in/',
  'https://www.tripuratenders.gov.in/',
];

const DOC_FIELDS = [
  ['tenderDetails', 'Tender details'],
  ['tenderDocs', 'Tender docs'],
  ['emdDoc', 'EMD doc'],
  ['sdDocs', 'SD docs'],
  ['corrigendum', 'Corrigendum'],
  ['tAck', 'TAck'],
];

function rowToForm(row) {
  return {
    portalLink: row.portalLink || '',
    ePublishedDate: row.ePublishedDate || '',
    closingDate: row.closingDate || '',
    openingDate: row.openingDate || '',
    titleAndRefNo: row.titleAndRefNo || '',
    tenderId: row.tenderId || '',
    organisationChain: row.organisationChain || '',
    tenderDetails: fileList(row.tenderDetails),
    emdAmount: row.emdAmount || '',
    emdDoc: fileList(row.emdDoc),
    emdDate: row.emdDate || '',
    emdMoneyOffice: row.emdMoneyOffice || '',
    emdThrough: row.emdThrough || '',
    emdMode: row.emdMode || '',
    preQualification: row.preQualification || '',
    tenderValue: row.tenderValue || '',
    tenderFee: row.tenderFee || '',
    productCategory: row.productCategory || '',
    tenderDocs: fileList(row.tenderDocs),
    sdMoney: row.sdMoney || '',
    sdDocs: fileList(row.sdDocs),
    sdIssueDate: row.sdIssueDate || '',
    sdExpireDate: row.sdExpireDate || '',
    sdMoneyOffice: row.sdMoneyOffice || '',
    sdThrough: row.sdThrough || '',
    sdMode: row.sdMode || '',
    corrigendum: fileList(row.corrigendum),
    subCategory: row.subCategory || '',
    tAck: fileList(row.tAck),
    isWin: winValue(row.isWin),
    status: row.status || 'pending',
  };
}

async function readJson(res, fallback) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    if (res.status === 413) return { success: false, message: `${fallback} The file is too large for the server.` };
    return { success: false, message: `${fallback} The server answered with status ${res.status}.` };
  }
}

async function postJson(url, payload, fallback) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const json = await readJson(res, fallback);
  if (!res.ok || !json.success) throw new Error(json.message || fallback);
  return json.data;
}

// Files go straight to storage because the hosted server (Vercel) rejects request bodies over about 4.5 MB.
async function uploadTenderDoc(file) {
  const failed = `Could not upload ${file.name}.`;
  const ticket = await postJson('/api/upload/daily-tender-doc/presign', { filename: file.name, size: file.size }, failed);

  if (!ticket.direct) {
    const body = new FormData();
    body.append('file', file);
    const res = await fetch('/api/upload/daily-tender-doc', { method: 'POST', headers: authHeaders(), body });
    const json = await readJson(res, failed);
    if (!res.ok || !json.success) throw new Error(json.message || failed);
    return json.data;
  }

  let put;
  try {
    put = await fetch(ticket.uploadUrl, { method: 'PUT', headers: ticket.headers, body: file });
  } catch {
    throw new Error(`${failed} Check your internet connection and try again.`);
  }
  if (!put.ok) throw new Error(`${failed} Storage answered with status ${put.status}.`);

  return postJson('/api/upload/daily-tender-doc/complete', { key: ticket.key, filename: file.name }, failed);
}

function formatDate(value) {
  if (!value) return '—';
  const [year, month, day] = String(value).split('-');
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

function dayStamp(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const stamp = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(stamp) ? null : stamp;
}

const EXPIRING_WITHIN_DAYS = 7;

function daysUntilClosing(closing) {
  const end = dayStamp(closing);
  if (end == null) return null;
  const now = new Date();
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((end - today) / 86400000);
}

function closingLabel(daysLeft) {
  if (daysLeft == null) return '';
  if (daysLeft < 0) return `Closed ${Math.abs(daysLeft)} day${Math.abs(daysLeft) === 1 ? '' : 's'} ago`;
  if (daysLeft === 0) return 'Closes today';
  return `${daysLeft} day${daysLeft === 1 ? '' : 's'} left`;
}

function urgencyColor(daysLeft) {
  if (daysLeft == null || daysLeft < 0) return 'var(--md-dim)';
  if (daysLeft <= 3) return '#e57373';
  if (daysLeft <= EXPIRING_WITHIN_DAYS) return '#ffb74d';
  return '#66bb6a';
}

const RESULT_LABEL = { win: 'Win', loss: 'Loss', cancelled: 'Cancelled' };

function isPendingResult(value) {
  return !RESULT_LABEL[value];
}

const RESULT_SLICES = [
  { key: 'win', label: 'Win', color: '#43a047', icon: Trophy },
  { key: 'loss', label: 'Loss', color: '#e53935', icon: CircleX },
  { key: 'cancelled', label: 'Cancelled', color: '#78909c', icon: Ban },
  { key: 'pending', label: 'Pending', color: '#ffa726', icon: Hourglass },
];

function TimeLeftDonut({ published, closing, result }) {
  const size = 46;
  const stroke = 4.5;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  if (!isPendingResult(result)) {
    const color = result === 'win' ? '#66bb6a' : result === 'loss' ? '#e57373' : '#9e9e9e';
    const title = RESULT_LABEL[result];
    const short = result === 'cancelled' ? 'CXL' : title.toUpperCase();
    return (
      <div className="relative inline-grid place-items-center" style={{ width: size, height: size }} title={title}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={title}>
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={color} strokeWidth={stroke} strokeDasharray={result === 'cancelled' ? '4 3' : undefined} />
        </svg>
        <span className="absolute text-[9px] font-bold leading-none tracking-wide" style={{ color }}>{short}</span>
      </div>
    );
  }

  const end = dayStamp(closing);
  if (end == null) return <span style={{ color: 'var(--md-dim)' }}>—</span>;

  const start = dayStamp(published);
  const daysLeft = daysUntilClosing(closing);
  const span = start == null ? null : Math.round((end - start) / 86400000);
  const closed = daysLeft < 0;
  const remaining = closed ? 0 : span != null && span > 0 ? Math.min(1, daysLeft / span) : 1;
  const color = urgencyColor(daysLeft);
  const title = closingLabel(daysLeft);

  return (
    <div className="relative inline-grid place-items-center" style={{ width: size, height: size }} title={title}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={title}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--md-border)" strokeWidth={stroke} />
        {remaining > 0 ? (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${circumference * remaining} ${circumference}`}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        ) : null}
      </svg>
      <span className="absolute text-[11px] font-semibold leading-none tabular-nums" style={{ color }}>{closed ? '0' : daysLeft}</span>
    </div>
  );
}

function safeHref(value) {
  try {
    const url = new URL(value);
    if (url.protocol === 'http:' || url.protocol === 'https:') return url.href;
  } catch {
    return null;
  }
  return null;
}

function formatStatus(value) {
  if (value === 'saved') return 'Saved';
  if (value === 'reject') return 'Reject';
  return 'Pending';
}

function formatWin(value) {
  return RESULT_LABEL[value] || '—';
}

function winValue(value) {
  if (value === true) return 'win';
  return RESULT_LABEL[value] ? value : '';
}

function formatAmount(value) {
  if (value == null || value === '') return '—';
  try {
    const amount = BigInt(value);
    if (amount > BigInt(Number.MAX_SAFE_INTEGER)) return String(value);
    return new Intl.NumberFormat('en-IN').format(Number(amount));
  } catch {
    return String(value);
  }
}

function Field({ label, children }) {
  return (
    <label className="block text-xs font-semibold" style={{ color: 'var(--md-muted)' }}>
      {label}
      {children}
    </label>
  );
}

function TextInput({ value, onChange, disabled, type = 'text', placeholder }) {
  return (
    <input
      type={type}
      value={value}
      disabled={disabled}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
      className={fieldClass}
      style={fieldStyle}
    />
  );
}

function GrowingText({ value, onChange, disabled, placeholder }) {
  const ref = useRef(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${el.scrollHeight + 4}px`;
  }, [value]);

  return (
    <textarea
      ref={ref}
      value={value}
      disabled={disabled}
      placeholder={placeholder}
      rows={1}
      onChange={(event) => onChange(event.target.value)}
      className={`${fieldClass} resize-none whitespace-pre-wrap break-words leading-relaxed`}
      style={{ ...fieldStyle, overflow: 'hidden', overflowWrap: 'anywhere' }}
    />
  );
}

function DocFiles({ label, files, readOnly, busy, disabled, onAdd, onRemove }) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  return (
    <div className="min-w-0 sm:col-span-2">
      <div className="text-xs font-semibold" style={{ color: 'var(--md-muted)' }}>
        {label}
        <div className="mt-1 space-y-2">
          {files.length === 0 ? (
            <p className="text-xs font-normal" style={{ color: 'var(--md-dim)' }}>No documents.</p>
          ) : (
            <ul className="grid gap-2">
              {files.map((file, index) => {
                const name = file.name || 'Document';
                const ext = name.includes('.') ? name.split('.').pop().toUpperCase() : '';
                const meta = [ext, formatBytes(file.size)].filter(Boolean).join(' · ');
                return (
                  <li
                    key={`${file.url}-${index}`}
                    className="group flex items-center gap-3 rounded-xl border border-[var(--md-border-strong)] bg-[var(--md-sidebar)] px-3 py-2.5 font-normal transition-colors hover:border-[var(--md-primary)]"
                  >
                    <a
                      href={file.url}
                      target="_blank"
                      rel="noreferrer"
                      className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[var(--md-surface2)]"
                      aria-label={`Open ${name}`}
                    >
                      <FileTypeIcon fileName={name} mime={file.mimeType} size={26} />
                    </a>
                    <div className="min-w-0 flex-1">
                      <a
                        href={file.url}
                        target="_blank"
                        rel="noreferrer"
                        title={name}
                        className="block truncate text-sm font-medium hover:underline"
                        style={{ color: 'var(--md-on)' }}
                      >
                        {name}
                      </a>
                      {meta ? <p className="mt-0.5 text-[11px] tracking-wide" style={{ color: 'var(--md-dim)' }}>{meta}</p> : null}
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <a
                        href={file.url}
                        target="_blank"
                        rel="noreferrer"
                        title="Open"
                        aria-label={`Open ${name}`}
                        className="grid h-8 w-8 place-items-center rounded-lg text-[var(--md-muted)] transition-colors hover:bg-[var(--md-surface2)] hover:text-[var(--md-on)]"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </a>
                      <a
                        href={file.url}
                        download={name}
                        title="Download"
                        aria-label={`Download ${name}`}
                        className="grid h-8 w-8 place-items-center rounded-lg bg-[var(--md-primary)] text-white shadow-sm transition-colors hover:bg-[var(--md-primary-hover)]"
                      >
                        <Download className="h-4 w-4" />
                      </a>
                      {readOnly ? null : (
                        <button
                          type="button"
                          title="Remove"
                          aria-label={`Remove ${name}`}
                          onClick={() => onRemove(index)}
                          className="grid h-8 w-8 place-items-center rounded-lg text-[var(--md-muted)] transition-colors hover:bg-red-500/10 hover:text-red-500"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {readOnly ? null : (
            <button
              type="button"
              disabled={disabled}
              onClick={() => inputRef.current?.click()}
              onDragOver={(event) => {
                if (disabled) return;
                event.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDragging(false);
                if (disabled || !event.dataTransfer.files?.length) return;
                onAdd({ target: { files: event.dataTransfer.files, value: '' } });
              }}
              className={`group flex w-full items-center gap-3 rounded-xl border border-dashed px-3 py-3 text-left font-normal transition-colors disabled:cursor-not-allowed disabled:opacity-70 ${
                dragging
                  ? 'border-[var(--md-primary)] bg-[var(--md-surface2)]'
                  : 'border-[var(--md-border-strong)] bg-transparent hover:border-[var(--md-primary)] hover:bg-[var(--md-sidebar)]'
              }`}
            >
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[var(--md-primary)] text-white shadow-sm transition-colors group-hover:bg-[var(--md-primary-hover)]">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium" style={{ color: 'var(--md-on)' }}>
                  {busy ? 'Uploading…' : dragging ? 'Drop files to upload' : files.length ? 'Add more documents' : 'Upload documents'}
                </span>
                <span className="mt-0.5 block text-[11px] tracking-wide" style={{ color: 'var(--md-dim)' }}>
                  {busy ? 'Please keep this window open' : `Click to browse or drag files here · PDF, Word, Excel, images, ZIP · up to ${MAX_DOC_MB} MB each`}
                </span>
              </span>
            </button>
          )}
          <input
            ref={inputRef}
            type="file"
            multiple
            accept=".pdf,.xlsx,.xls,.csv,.docx,.doc,.jpg,.jpeg,.png,.webp,.svg,.txt,.zip,.rar,.dwg,.dxf"
            disabled={disabled || readOnly}
            onChange={onAdd}
            style={{ display: 'none' }}
          />
        </div>
      </div>
    </div>
  );
}

export default function DailyTendersPage() {
  const toast = useToast();
  const { user } = useAuth();
  const canWrite = user?.role === 'T';
  const canSeeSaved = Boolean(user) && user.role !== 'T';
  const [view, setView] = useState('daily');
  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingField, setUploadingField] = useState('');
  const [savingId, setSavingId] = useState(null);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [modal, setModal] = useState(null);
  const [readOnly, setReadOnly] = useState(false);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [resultConfirm, setResultConfirm] = useState(0);
  const [saveConfirm, setSaveConfirm] = useState(0);
  const [pendingResult, setPendingResult] = useState('');
  const [reload, setReload] = useState(0);
  const [expiring, setExpiring] = useState([]);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [resultFilter, setResultFilter] = useState('all');
  const [resultSummary, setResultSummary] = useState(null);
  const alertsRef = useRef(null);

  const listView = canSeeSaved ? view : 'daily';
  const isDaily = listView === 'daily';
  const activeResult = isDaily ? 'all' : resultFilter;
  const resultSlices = RESULT_SLICES.map((slice) => ({
    ...slice,
    count: resultSummary?.[slice.key]?.count || 0,
    amount: BigInt(resultSummary?.[slice.key]?.amount || 0),
  }));

  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    setPage(1);
  }, [search, view, resultFilter]);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      setLoading(true);
      setError('');
      try {
        const params = new URLSearchParams({ page: String(page), limit: '10', view: listView });
        if (search) params.set('search', search);
        if (activeResult !== 'all') params.set('result', activeResult);
        const res = await fetch(`/api/daily-tenders?${params}`, { headers: authHeaders() });
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok || !json.success) throw new Error(json.message || 'Could not load tenders.');
        setRows(json.data || []);
        setPages(json.pagination?.totalPages || 1);
        setTotal(json.pagination?.total || 0);
      } catch (loadError) {
        if (!cancelled) setError(loadError.message || 'Could not load tenders.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [page, search, listView, activeResult, reload]);

  useEffect(() => {
    if (isDaily) return undefined;
    let cancelled = false;
    async function run() {
      try {
        const params = new URLSearchParams({ view: 'saved', summary: '1' });
        if (search) params.set('search', search);
        const res = await fetch(`/api/daily-tenders?${params}`, { headers: authHeaders() });
        const json = await res.json();
        if (!cancelled && res.ok && json.success) setResultSummary(json.data);
      } catch {
        if (!cancelled) setResultSummary(null);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [isDaily, search, reload]);

  useEffect(() => {
    if (!canSeeSaved) {
      setExpiring([]);
      return undefined;
    }
    let cancelled = false;
    async function run() {
      try {
        const res = await fetch('/api/daily-tenders?view=saved&alert=expiring', { headers: authHeaders() });
        const json = await res.json();
        if (cancelled || !res.ok || !json.success) return;
        const rows = (json.data || [])
          .filter((row) => isPendingResult(row.isWin))
          .map((row) => ({ row, daysLeft: daysUntilClosing(row.closingDate) }))
          .filter((item) => item.daysLeft != null && item.daysLeft <= EXPIRING_WITHIN_DAYS)
          .sort((a, b) => a.daysLeft - b.daysLeft);
        setExpiring(rows);
      } catch {
        if (!cancelled) setExpiring([]);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [canSeeSaved, reload]);

  useEffect(() => {
    if (isDaily) setAlertsOpen(false);
  }, [isDaily]);

  useEffect(() => {
    if (!alertsOpen) return undefined;
    const onPointer = (event) => {
      if (alertsRef.current && !alertsRef.current.contains(event.target)) setAlertsOpen(false);
    };
    const onKey = (event) => {
      if (event.key === 'Escape') setAlertsOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [alertsOpen]);

  const setField = (name, value) => {
    setForm((current) => ({ ...current, [name]: value }));
  };

  const openForm = (row, locked = false, sourceView = view) => {
    if (sourceView === 'saved') setView('saved');
    setSelected(row || null);
    setReadOnly(locked || (row?.status || '') === 'saved');
    setForm(row ? rowToForm(row) : emptyForm);
    setResultConfirm(0);
    setSaveConfirm(0);
    setPendingResult('');
    setFormError('');
    setModal('form');
  };

  const addDocs = async (name, event) => {
    const chosen = Array.from(event.target.files || []);
    event.target.value = '';
    if (!chosen.length || uploadingField) return;
    const tooLarge = chosen.filter((file) => file.size > MAX_DOC_SIZE);
    const picked = chosen.filter((file) => file.size <= MAX_DOC_SIZE);
    const sizeMessage = tooLarge.length
      ? `${tooLarge.map((file) => file.name).join(', ')} ${tooLarge.length === 1 ? 'is' : 'are'} larger than ${MAX_DOC_MB} MB and ${tooLarge.length === 1 ? 'was' : 'were'} not uploaded.`
      : '';
    setFormError(sizeMessage);
    if (!picked.length) return;
    setUploadingField(name);
    const added = [];
    try {
      for (const file of picked) {
        const data = await uploadTenderDoc(file);
        added.push({
          name: data.filename || file.name,
          url: data.url,
          size: data.size,
          mimeType: data.mimeType,
        });
      }
      setForm((current) => ({ ...current, [name]: [...fileList(current[name]), ...added] }));
    } catch (uploadError) {
      if (added.length) {
        setForm((current) => ({ ...current, [name]: [...fileList(current[name]), ...added] }));
      }
      setFormError([sizeMessage, uploadError.message || 'Could not upload a document.'].filter(Boolean).join(' '));
    } finally {
      setUploadingField('');
    }
  };

  const removeDoc = (name, index) => {
    setForm((current) => ({
      ...current,
      [name]: fileList(current[name]).filter((_, itemIndex) => itemIndex !== index),
    }));
  };

  const askSave = (event) => {
    event?.preventDefault();
    if (saving || readOnly || uploadingField || saveConfirm) return;
    setSaveConfirm(1);
  };

  const cancelSaveConfirm = () => {
    if (saving) return;
    setSaveConfirm(0);
  };

  const saveTender = async () => {
    if (saving || readOnly || uploadingField) return;
    setSaving(true);
    setFormError('');
    try {
      // A new tender on the Saved tab goes straight to saved tenders as manually added.
      const addingSaved = !selected && listView === 'saved';
      const res = await fetch(selected ? `/api/daily-tenders/${selected.id}` : addingSaved ? '/api/daily-tenders/saved' : '/api/daily-tenders', {
        method: selected ? 'PUT' : 'POST',
        headers: authHeaders(true),
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setSaveConfirm(0);
        setFormError(json.message || 'Could not save this tender.');
        return;
      }
      toast.success(selected ? 'Daily tender updated.' : addingSaved ? 'Tender added to saved tenders.' : 'Daily tender added.');
      setSaveConfirm(0);
      setModal(null);
      setReload((count) => count + 1);
    } catch {
      setSaveConfirm(0);
      setFormError('Network error while saving.');
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!selected || saving) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/daily-tenders/${selected.id}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        toast.error(json.message || 'Could not delete this tender.');
        return;
      }
      toast.success('Daily tender deleted.');
      setModal(null);
      setReload((count) => count + 1);
    } catch {
      toast.error('Network error while deleting.');
    } finally {
      setSaving(false);
    }
  };

  const saveToSaved = async (row) => {
    if (savingId || (row.status || 'pending') !== 'pending') return;
    setSavingId(`save:${row.id}`);
    try {
      const res = await fetch(`/api/daily-tenders/${row.id}/save`, {
        method: 'POST',
        headers: authHeaders(),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        toast.error(json.message || 'Could not save this tender.');
        return;
      }
      toast.success('Tender saved.');
      setReload((count) => count + 1);
    } catch {
      toast.error('Network error while saving.');
    } finally {
      setSavingId(null);
    }
  };

  const rejectTender = async (row) => {
    if (savingId || (row.status || 'pending') !== 'pending') return;
    setSavingId(`reject:${row.id}`);
    try {
      const res = await fetch(`/api/daily-tenders/${row.id}/reject`, {
        method: 'POST',
        headers: authHeaders(),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        toast.error(json.message || 'Could not reject this tender.');
        return;
      }
      toast.success('Tender rejected.');
      setReload((count) => count + 1);
    } catch {
      toast.error('Network error while rejecting.');
    } finally {
      setSavingId(null);
    }
  };

  const cols = isDaily ? 11 : 10;
  const savedOutcome = readOnly && !isDaily;
  // Result, status, the rest of EMD and all SD details are filled in later, not when a tender is first added.
  const adding = !selected;
  const lockField = (group) => {
    if (!readOnly) return false;
    if (!savedOutcome) return true;
    if (group === 'emd') return form.isWin !== 'loss' && form.isWin !== 'cancelled';
    if (group === 'sd') return form.isWin !== 'win';
    return true;
  };

  const askResult = (next) => {
    if (saving || resultConfirm || !selected || next === form.isWin) return;
    setPendingResult(next);
    setResultConfirm(1);
  };

  const cancelResultConfirm = () => {
    if (saving) return;
    setResultConfirm(0);
    setPendingResult('');
  };

  const updateResult = async () => {
    const next = pendingResult;
    if (saving || !selected || isPendingResult(next)) return;
    const label = RESULT_LABEL[next];
    setSaving(true);
    setFormError('');
    try {
      const res = await fetch(`/api/daily-tenders/saved/${selected.id}`, {
        method: 'PUT',
        headers: authHeaders(true),
        body: JSON.stringify({ isWin: next }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setFormError(json.message || 'Could not update this result.');
        return;
      }
      setField('isWin', next);
      setResultConfirm(0);
      setPendingResult('');
      toast.success(`Result updated to ${label}.`);
      setReload((count) => count + 1);
    } catch {
      setFormError('Network error while updating the result.');
    } finally {
      setSaving(false);
    }
  };

  const saveOutcome = async (event) => {
    event?.preventDefault();
    if (saving || !selected || uploadingField) return;
    setSaving(true);
    setFormError('');
    try {
      const res = await fetch(`/api/daily-tenders/saved/${selected.id}`, {
        method: 'PUT',
        headers: authHeaders(true),
        body: JSON.stringify({
          isWin: form.isWin,
          emdAmount: form.emdAmount,
          emdDoc: form.emdDoc,
          emdDate: form.emdDate,
          emdMoneyOffice: form.emdMoneyOffice,
          emdThrough: form.emdThrough,
          emdMode: form.emdMode,
          sdMoney: form.sdMoney,
          sdDocs: form.sdDocs,
          sdIssueDate: form.sdIssueDate,
          sdExpireDate: form.sdExpireDate,
          sdMoneyOffice: form.sdMoneyOffice,
          sdThrough: form.sdThrough,
          sdMode: form.sdMode,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setFormError(json.message || 'Could not update this saved tender.');
        return;
      }
      toast.success('Saved tender updated.');
      setModal(null);
      setReload((count) => count + 1);
    } catch {
      setFormError('Network error while saving.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <ModuleHeader
          icon={ClipboardList}
          title="Daily Tenders"
          description={canWrite
            ? 'Add, edit, and delete daily tenders.'
            : 'View daily tenders. Save copies a row into Saved tenders, or reject it. Adding and editing is limited to the tender role.'}
        />
        {canSeeSaved ? (
        <div className="inline-flex rounded-lg p-1" style={{ background: 'var(--md-surface)', border: '1px solid var(--md-border)' }}>
          {[
            ['daily', 'Daily tenders'],
            ['saved', 'Saved tenders'],
          ].map(([key, label]) => {
            const active = view === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setView(key)}
                className="rounded-md px-3 py-1.5 text-sm font-medium"
                style={{
                  background: active ? 'var(--md-primary)' : 'transparent',
                  color: active ? '#fff' : 'var(--md-muted)',
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
        ) : null}
      </div>

      {error ? (
        <p className="rounded-lg px-3 py-2 text-sm" style={{ background: 'var(--md-surface)', color: '#e57373' }}>{error}</p>
      ) : null}

      {isDaily ? null : (
        <DonutCard
          wide
          title="Saved tender results"
          hint={search ? 'Saved tenders matching the search. Select a result to filter the list.' : 'Win, loss, cancelled and pending saved tenders, with total tender value. Select a result to filter the list.'}
          slices={resultSlices}
          selected={resultFilter}
          onSelect={(key) => setResultFilter((current) => (current === key ? 'all' : key))}
          loading={!resultSummary}
          emptyText="No saved tenders to chart."
        />
      )}

      <section className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <p className="text-xs" style={{ color: 'var(--md-dim)' }}>
            {loading && !total ? 'Loading tenders…' : `${total} ${isDaily ? 'daily' : activeResult === 'all' ? 'saved' : `${RESULT_SLICES.find((slice) => slice.key === activeResult)?.label.toLowerCase()} saved`} tender${total === 1 ? '' : 's'}`}
          </p>
          <div className="flex flex-wrap items-end gap-2">
            {canSeeSaved && !isDaily ? (
              <div className="relative" ref={alertsRef}>
                <button
                  type="button"
                  onClick={() => setAlertsOpen((open) => !open)}
                  aria-expanded={alertsOpen}
                  aria-haspopup="dialog"
                  className="inline-flex h-[38px] items-center gap-1.5 rounded-lg px-3 text-sm font-medium"
                  style={{
                    background: expiring.length ? 'rgba(255,152,0,0.12)' : 'var(--md-sidebar)',
                    border: expiring.length ? '1px solid rgba(255,152,0,0.35)' : '1px solid var(--md-border-strong)',
                    color: expiring.length ? '#ffcc80' : 'var(--md-muted)',
                  }}
                >
                  <Bell className="h-4 w-4" />
                  Expiring
                  {expiring.length ? (
                    <span className="rounded-full px-1.5 text-[10px] font-bold" style={{ background: '#ef6c00', color: '#fff' }}>{expiring.length}</span>
                  ) : null}
                </button>
                {alertsOpen ? (
                  <div
                    role="dialog"
                    aria-label="Expiring saved tenders with a pending result"
                    className="absolute right-0 z-30 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-xl p-2"
                    style={{ background: 'var(--md-surface2)', border: '1px solid var(--md-border-strong)', boxShadow: '0 8px 24px rgba(0,0,0,0.7)' }}
                  >
                    <p className="px-2 py-1.5 text-xs font-semibold" style={{ color: 'var(--md-muted)' }}>
                      Saved tenders closing within {EXPIRING_WITHIN_DAYS} days, result still pending
                    </p>
                    {expiring.length === 0 ? (
                      <p className="px-2 py-3 text-sm" style={{ color: 'var(--md-dim)' }}>None right now.</p>
                    ) : (
                      <ul className="max-h-80 space-y-1 overflow-y-auto">
                        {expiring.map(({ row, daysLeft }) => (
                          <li key={row.id}>
                            <button
                              type="button"
                              className="w-full rounded-lg px-2 py-2 text-left hover:bg-[var(--md-surface3)]"
                              style={{ color: 'var(--md-on)' }}
                              onClick={() => {
                                setAlertsOpen(false);
                                openForm(row, true, 'saved');
                              }}
                            >
                              <span className="block truncate text-sm font-medium">{row.titleAndRefNo}</span>
                              <span className="mt-0.5 flex items-center justify-between gap-2 text-xs">
                                <span style={{ color: 'var(--md-dim)' }}>Closes {formatDate(row.closingDate)}</span>
                                <span className="font-semibold" style={{ color: urgencyColor(daysLeft) }}>{closingLabel(daysLeft)}</span>
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ) : null}
              </div>
            ) : null}
            <label className="relative text-xs font-semibold" style={{ color: 'var(--md-muted)' }}>
              Search
              <Search className="pointer-events-none absolute left-3 top-8 h-4 w-4" style={{ color: 'var(--md-dim)' }} />
              <input
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Title, tender ID, category, or link"
                className={`${fieldClass} pl-9`}
                style={fieldStyle}
              />
            </label>
            {isDaily && canWrite ? (
              <Button variant="primary" size="sm" onClick={() => openForm(null)}>
                <Plus className="h-4 w-4" /> Add tender
              </Button>
            ) : null}
            {!isDaily && canSeeSaved ? (
              <Button variant="primary" size="sm" onClick={() => openForm(null, false, 'saved')} title="Add a tender found on another portal, in a newspaper, or in a letter">
                <Plus className="h-4 w-4" /> Add tender manually
              </Button>
            ) : null}
          </div>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title and ref no</TableHead>
              <TableHead>Tender ID</TableHead>
              <TableHead>Published</TableHead>
              <TableHead>Closing</TableHead>
              <TableHead>Time left</TableHead>
              <TableHead>Value</TableHead>
              <TableHead>Tender fee</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Result</TableHead>
              {isDaily ? <TableHead>Status</TableHead> : null}
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableLoadingState cols={cols} />
            ) : rows.length === 0 ? (
              <TableEmptyState
                colSpan={cols}
                icon={Bookmark}
                title={isDaily ? 'No daily tenders' : 'No saved tenders'}
                description={search ? 'Nothing matches this search.' : activeResult !== 'all' ? 'No saved tenders with this result.' : isDaily ? (canWrite ? 'Add the first daily tender.' : 'No daily tenders yet.') : 'Save a daily tender to keep a copy here.'}
                action={isDaily && canWrite && !search ? (
                  <Button variant="primary" size="sm" onClick={() => openForm(null)}>
                    <Plus className="h-4 w-4" /> Add tender
                  </Button>
                ) : null}
              />
            ) : (
              rows.map((row) => (
                <TableRow key={row.id} className="cursor-pointer" onClick={() => openForm(row, true)}>
                  <TableCell>
                    <div className="max-w-xs">
                      <p className="font-medium" style={{ color: 'var(--md-on)' }}>{row.titleAndRefNo}</p>
                      {!isDaily && row.status === 'manual' ? (
                        <span className="mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium" style={{ color: 'var(--md-primary-hover)', background: 'color-mix(in srgb, var(--md-primary) 14%, transparent)', border: '1px solid color-mix(in srgb, var(--md-primary) 35%, transparent)' }}>
                          <Pencil className="h-3 w-3" /> Manually added
                        </span>
                      ) : null}
                      {safeHref(row.portalLink) ? (
                        <a href={safeHref(row.portalLink)} target="_blank" rel="noreferrer" className="mt-0.5 block truncate text-xs underline" style={{ color: 'var(--md-muted)' }} onClick={(event) => event.stopPropagation()}>
                          {row.portalLink}
                        </a>
                      ) : row.portalLink ? (
                        <p className="mt-0.5 truncate text-xs" style={{ color: 'var(--md-dim)' }}>{row.portalLink}</p>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell>{row.tenderId}</TableCell>
                  <TableCell>{formatDate(row.ePublishedDate)}</TableCell>
                  <TableCell>{formatDate(row.closingDate)}</TableCell>
                  <TableCell>
                    <TimeLeftDonut published={row.ePublishedDate} closing={row.closingDate} result={isDaily ? '' : winValue(row.isWin)} />
                  </TableCell>
                  <TableCell>{formatAmount(row.tenderValue)}</TableCell>
                  <TableCell>{row.tenderFee == null ? '—' : formatAmount(row.tenderFee)}</TableCell>
                  <TableCell>
                    <div>
                      <p>{row.productCategory}</p>
                      <p className="text-xs" style={{ color: 'var(--md-dim)' }}>{row.subCategory}</p>
                    </div>
                  </TableCell>
                  <TableCell>{formatWin(row.isWin)}</TableCell>
                  {isDaily ? <TableCell>{formatStatus(row.status)}</TableCell> : null}
                  <TableCell>
                    <div className="flex justify-end gap-1" onClick={(event) => event.stopPropagation()}>
                      {isDaily ? (
                        <>
                          <Button variant="ghost" size="sm" onClick={() => openForm(row, true)}>View</Button>
                          {canSeeSaved ? (
                            <>
                              <Button
                                variant="success"
                                size="sm"
                                title={(row.status || 'pending') === 'pending' ? 'Save to Saved tenders' : 'Already saved'}
                                disabled={(row.status || 'pending') !== 'pending'}
                                isLoading={savingId === `save:${row.id}`}
                                onClick={() => saveToSaved(row)}
                              >
                                <Save className="h-3.5 w-3.5" /> Save
                              </Button>
                              <Button
                                variant="danger"
                                size="sm"
                                title={(row.status || 'pending') === 'pending' ? 'Reject this tender' : 'Already decided'}
                                disabled={(row.status || 'pending') !== 'pending'}
                                isLoading={savingId === `reject:${row.id}`}
                                onClick={() => rejectTender(row)}
                              >
                                Reject
                              </Button>
                            </>
                          ) : null}
                          {canWrite ? (
                            <>
                              {(row.status || 'pending') === 'saved' ? null : (
                                <Button variant="ghost" size="icon" title="Edit" onClick={() => openForm(row)}>
                                  <Pencil className="h-4 w-4" />
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="icon"
                                title="Delete"
                                onClick={() => {
                                  setSelected(row);
                                  setModal('delete');
                                }}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </>
                          ) : null}
                        </>
                      ) : (
                        <Button variant="ghost" size="sm" onClick={() => openForm(row, true)}>View</Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        <div className="flex items-center justify-end gap-2 text-sm" style={{ color: 'var(--md-muted)' }}>
          <span>Page {page} of {pages}</span>
          <Button variant="outline" size="icon" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" disabled={page >= pages} onClick={() => setPage(page + 1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </section>

      <Modal
        isOpen={modal === 'form'}
        onClose={() => {
          if (resultConfirm || saveConfirm) return;
          setModal(null);
        }}
        maxWidth="max-w-4xl"
        title={savedOutcome ? (selected?.titleAndRefNo || 'Saved tender') : readOnly ? (selected?.titleAndRefNo || 'Tender details') : selected ? 'Update daily tender' : listView === 'saved' ? 'Add tender manually' : 'Add daily tender'}
        description={savedOutcome ? 'Choosing Win, Loss or Cancelled asks for three confirmations before the result is updated. It can be changed again the same way. Win unlocks the SD fields. Loss or Cancelled unlocks the EMD fields.' : readOnly ? 'All details for this tender.' : 'Every field can be changed. Saving asks for two confirmations.'}
        footer={savedOutcome ? (
          <>
            <Button variant="outline" onClick={() => setModal(null)} disabled={saving}>Close</Button>
            <Button variant="primary" isLoading={saving} disabled={Boolean(uploadingField) || isPendingResult(form.isWin)} onClick={saveOutcome}>Save changes</Button>
          </>
        ) : readOnly ? (
          <Button variant="outline" onClick={() => setModal(null)}>Close</Button>
        ) : (
          <>
            <Button variant="outline" onClick={() => setModal(null)} disabled={saving}>Cancel</Button>
            <Button variant="primary" isLoading={saving} disabled={Boolean(uploadingField)} onClick={askSave}>
              {selected ? 'Save changes' : 'Add tender'}
            </Button>
          </>
        )}
      >
        <form onSubmit={savedOutcome ? saveOutcome : askSave} className="grid min-w-0 gap-3 sm:grid-cols-2">
          {formError ? (
            <p className="rounded-lg px-3 py-2 text-sm sm:col-span-2" style={{ background: 'var(--md-surface)', color: '#e57373' }}>{formError}</p>
          ) : null}
          {!selected && listView === 'saved' ? (
            // A manually added tender can come from anywhere: another website,
            // a newspaper, or a department letter. Known portals are suggested.
            <Field label="Source (link or name)">
              <input
                type="text"
                list="manual-tender-sources"
                value={form.portalLink}
                onChange={(event) => setField('portalLink', event.target.value)}
                placeholder="https://… or e.g. Assam Tribune, 2 Oct"
                className={fieldClass}
                style={fieldStyle}
              />
              <datalist id="manual-tender-sources">
                {PORTAL_LINKS.map((link) => <option key={link} value={link} />)}
              </datalist>
            </Field>
          ) : (
            <Field label="Portal link">
              <select
                disabled={readOnly}
                value={form.portalLink}
                onChange={(event) => setField('portalLink', event.target.value)}
                className={fieldClass}
                style={fieldStyle}
              >
                <option value="">Select a portal</option>
                {form.portalLink && !PORTAL_LINKS.includes(form.portalLink) ? (
                  <option value={form.portalLink}>{form.portalLink}</option>
                ) : null}
                {PORTAL_LINKS.map((link) => (
                  <option key={link} value={link}>{link}</option>
                ))}
              </select>
            </Field>
          )}
          <Field label="Tender ID">
            <TextInput disabled={readOnly} value={form.tenderId} onChange={(value) => setField('tenderId', value)} />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Title and ref no">
              <TextInput disabled={readOnly} value={form.titleAndRefNo} onChange={(value) => setField('titleAndRefNo', value)} />
            </Field>
          </div>
          <Field label="Organisation chain">
            <TextInput disabled={readOnly} value={form.organisationChain} onChange={(value) => setField('organisationChain', value)} />
          </Field>
          <Field label="Product category">
            <TextInput disabled={readOnly} value={form.productCategory} onChange={(value) => setField('productCategory', value)} />
          </Field>
          <Field label="Sub category">
            <TextInput disabled={readOnly} value={form.subCategory} onChange={(value) => setField('subCategory', value)} />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Pre qualification/eligibility Criteria">
              <GrowingText disabled={readOnly} value={form.preQualification} onChange={(value) => setField('preQualification', value)} />
            </Field>
          </div>
          <Field label="e-Published date">
            <TextInput disabled={readOnly} type="date" value={form.ePublishedDate} onChange={(value) => setField('ePublishedDate', value)} />
          </Field>
          <Field label="Closing date">
            <TextInput disabled={readOnly} type="date" value={form.closingDate} onChange={(value) => setField('closingDate', value)} />
          </Field>
          <Field label="Opening date">
            <TextInput disabled={readOnly} type="date" value={form.openingDate} onChange={(value) => setField('openingDate', value)} />
          </Field>
          <Field label="Tender value">
            <TextInput disabled={readOnly} value={form.tenderValue} onChange={(value) => setField('tenderValue', value)} placeholder="Whole number" />
          </Field>
          <Field label="Tender fee">
            <TextInput disabled={readOnly} value={form.tenderFee} onChange={(value) => setField('tenderFee', value)} placeholder="Optional whole number" />
          </Field>
          <Field label="EMD amount">
            <TextInput disabled={lockField('emd')} value={form.emdAmount} onChange={(value) => setField('emdAmount', value)} placeholder="Whole number" />
          </Field>
          {adding ? null : (<>
          <Field label="EMD date">
            <TextInput disabled={lockField('emd')} type="date" value={form.emdDate} onChange={(value) => setField('emdDate', value)} />
          </Field>
          <Field label="EMD money office">
            <TextInput disabled={lockField('emd')} value={form.emdMoneyOffice} onChange={(value) => setField('emdMoneyOffice', value)} />
          </Field>
          <Field label="EMD through">
            <select disabled={lockField('emd')} value={form.emdThrough} onChange={(event) => setField('emdThrough', event.target.value)} className={fieldClass} style={fieldStyle}>
              <option value="">Not set</option>
              {MONEY_THROUGH_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </Field>
          <Field label="EMD mode">
            <select disabled={lockField('emd')} value={form.emdMode} onChange={(event) => setField('emdMode', event.target.value)} className={fieldClass} style={fieldStyle}>
              <option value="">Not set</option>
              {MONEY_MODE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </Field>
          <Field label="SD money">
            <TextInput disabled={lockField('sd')} value={form.sdMoney} onChange={(value) => setField('sdMoney', value)} placeholder="Optional whole number" />
          </Field>
          <Field label="SD issue date">
            <TextInput disabled={lockField('sd')} type="date" value={form.sdIssueDate} onChange={(value) => setField('sdIssueDate', value)} />
          </Field>
          <Field label="SD expire date">
            <TextInput disabled={lockField('sd')} type="date" value={form.sdExpireDate} onChange={(value) => setField('sdExpireDate', value)} />
          </Field>
          <Field label="SD money office">
            <TextInput disabled={lockField('sd')} value={form.sdMoneyOffice} onChange={(value) => setField('sdMoneyOffice', value)} />
          </Field>
          <Field label="SD through">
            <select disabled={lockField('sd')} value={form.sdThrough} onChange={(event) => setField('sdThrough', event.target.value)} className={fieldClass} style={fieldStyle}>
              <option value="">Not set</option>
              {MONEY_THROUGH_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </Field>
          <Field label="SD mode">
            <select disabled={lockField('sd')} value={form.sdMode} onChange={(event) => setField('sdMode', event.target.value)} className={fieldClass} style={fieldStyle}>
              <option value="">Not set</option>
              {MONEY_MODE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </Field>
          <Field label="Result">
            {savedOutcome ? (
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <Button type="button" variant={form.isWin === 'win' ? 'success' : 'outline'} disabled={saving || Boolean(resultConfirm)} onClick={() => askResult('win')}>Win</Button>
                <Button type="button" variant={form.isWin === 'loss' ? 'danger' : 'outline'} disabled={saving || Boolean(resultConfirm)} onClick={() => askResult('loss')}>Loss</Button>
                <Button type="button" variant={form.isWin === 'cancelled' ? 'secondary' : 'outline'} disabled={saving || Boolean(resultConfirm)} onClick={() => askResult('cancelled')}>Cancelled</Button>
              </div>
            ) : (
              <select
                disabled={readOnly}
                value={form.isWin}
                onChange={(event) => setField('isWin', event.target.value)}
                className={fieldClass}
                style={fieldStyle}
              >
                <option value="">Not set</option>
                <option value="win">Win</option>
                <option value="loss">Loss</option>
                <option value="cancelled">Cancelled</option>
              </select>
            )}
          </Field>
          {savedOutcome ? null : (
            <Field label="Status">
              <select
                disabled={readOnly}
                value={form.status || 'pending'}
                onChange={(event) => setField('status', event.target.value)}
                className={fieldClass}
                style={fieldStyle}
              >
                <option value="pending">Pending</option>
                <option value="saved">Saved</option>
                <option value="reject">Reject</option>
              </select>
            </Field>
          )}
          </>)}
          {DOC_FIELDS.map(([name, label]) => (
            <DocFiles
              key={name}
              label={label}
              files={fileList(form[name])}
              readOnly={lockField(name === 'emdDoc' ? 'emd' : name === 'sdDocs' ? 'sd' : 'other')}
              busy={uploadingField === name}
              disabled={Boolean(uploadingField) || lockField(name === 'emdDoc' ? 'emd' : name === 'sdDocs' ? 'sd' : 'other')}
              onAdd={(event) => addDocs(name, event)}
              onRemove={(index) => removeDoc(name, index)}
            />
          ))}
        </form>
      </Modal>

      <Modal
        isOpen={modal === 'delete'}
        onClose={() => setModal(null)}
        title="Delete daily tender"
        description="This removes the daily row. Saved copies stay."
        footer={(
          <>
            <Button variant="outline" onClick={() => setModal(null)} disabled={saving}>Cancel</Button>
            <Button variant="danger" isLoading={saving} onClick={confirmDelete}>Delete</Button>
          </>
        )}
      >
        <p className="text-sm" style={{ color: 'var(--md-muted)' }}>
          {selected?.titleAndRefNo || 'This tender'} will be removed from daily tenders.
        </p>
      </Modal>

      <ConfirmDialog
        isOpen={saveConfirm === 1}
        onClose={cancelSaveConfirm}
        onConfirm={() => setSaveConfirm(2)}
        title={selected ? 'Save these changes?' : 'Add this tender?'}
        description="This is the first confirmation. A second confirmation is required before it is saved."
        confirmText="Continue"
        cancelText="Cancel"
        variant="primary"
      />
      <ConfirmDialog
        isOpen={saveConfirm === 2}
        onClose={cancelSaveConfirm}
        onConfirm={saveTender}
        title="Confirm again"
        description={selected ? 'Every field on this form will be saved on the daily tender.' : 'This tender will be added with the fields on this form.'}
        confirmText={selected ? 'Save changes' : 'Add tender'}
        cancelText="Cancel"
        variant="primary"
        isLoading={saving}
      />
      <ConfirmDialog
        isOpen={resultConfirm === 1}
        onClose={cancelResultConfirm}
        onConfirm={() => setResultConfirm(2)}
        title={`Set the result to ${RESULT_LABEL[pendingResult] || 'Win'}?`}
        description="This is the first confirmation. Two more confirmations are required before the result is updated."
        confirmText="Continue"
        cancelText="Cancel"
        variant="warning"
      />
      <ConfirmDialog
        isOpen={resultConfirm === 2}
        onClose={cancelResultConfirm}
        onConfirm={() => setResultConfirm(3)}
        title="Confirm again"
        description="This is the second confirmation. One more confirmation is required before the result is updated."
        confirmText="Continue"
        cancelText="Cancel"
        variant="warning"
      />
      <ConfirmDialog
        isOpen={resultConfirm === 3}
        onClose={cancelResultConfirm}
        onConfirm={updateResult}
        title="Confirm a third time"
        description={`${RESULT_LABEL[pendingResult] || 'Win'} will be saved as the result. It can be changed later with three more confirmations.`}
        confirmText="Update result"
        cancelText="Cancel"
        variant="warning"
        isLoading={saving}
      />
    </div>
  );
}
