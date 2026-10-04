'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PieChart, Plus, RefreshCw, Pencil, ChevronLeft, ChevronRight, Search, Download, Printer, X } from 'lucide-react';
import { useToast } from '@/components/providers/ToastProvider';
import { FileTypeIcon } from '@/components/desk/FileTypeIcon';
import {
  amountError,
  normalizeBillNoInput,
  parseTreasuryBillDocs,
  paymentExceedsBill,
  TREASURY_IMAGE_MAX,
  treasuryBillDocLabel,
  treasuryImageError,
  treasuryImagesError,
} from '@/lib/bills';
import { Card, CardContent } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import ModuleHeader from '@/components/layout/ModuleHeader';
import Modal from '@/components/ui/Modal';
import LoadingState from '@/components/ui/LoadingState';
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

const fieldClass = 'mt-1 block w-full rounded-lg px-3 py-2 text-sm outline-none';
const fieldStyle = {
  background: 'var(--md-sidebar)',
  border: '1px solid var(--md-border-strong)',
  color: 'var(--md-on)',
};

const SLICE_COLORS = {
  received: '#5c6bc0',
  remaining: '#90a4ae',
  paid: '#00897b',
  unpaid: '#90a4ae',
};

const PARTY_SLICE_COLORS = ['#5c6bc0', '#00897b', '#ef6c00', '#8e24aa', '#039be5', '#c0ca33', '#d81b60', '#00838f'];
const PARTY_SLICE_LIMIT = 8;

const emptyPayment = {
  projectId: '',
  billDate: '',
  billNo: '',
  paymentReceivedDate: '',
  amountReceived: '',
};

const IMAGE_EXT = /\.(jpe?g|png|webp|gif)$/i;

const emptyBill = {
  projectId: '',
  billDate: '',
  billNo: '',
  billAmount: '',
  partyId: '',
  partyName: '',
  partyIsNew: false,
  partyPhone: '',
  gst: '',
  phoneNo: '',
  billPayment: '',
  billPaymentDate: '',
};

const emptyBillPayment = {
  billPayment: '',
  billPaymentDate: '',
  billAmount: '',
};

function partyNameOf(row) {
  return row?.party?.name || '';
}

function partyPhoneOf(row) {
  return row?.party?.phoneNo || '';
}

function authHeaders(json = false) {
  const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (json) headers['Content-Type'] = 'application/json';
  return headers;
}

function formatRupees(value) {
  if (value === null || value === undefined || value === '') return '—';
  const num = Number(value);
  if (!Number.isFinite(num)) return `₹${value}`;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(num);
}

function formatPercent(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  const rounded = Math.round(Number(value) * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)}%`;
}

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function csvCell(value) {
  const text = value == null ? '' : String(value);
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function downloadCsv(filename, lines) {
  const blob = new Blob([`\uFEFF${lines.join('\n')}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function dateInputValue(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function sliceColor(slice) {
  return slice.color || SLICE_COLORS[slice.key] || '#5c6bc0';
}

function partyChartFromBills(rows) {
  const sorted = [...(rows || [])]
    .filter((row) => Number(row.amount) > 0)
    .sort((left, right) => Number(right.amount) - Number(left.amount));
  if (sorted.length === 0) return { slices: [], total: 0 };
  const top = sorted.slice(0, PARTY_SLICE_LIMIT);
  const rest = sorted.slice(PARTY_SLICE_LIMIT);
  const slices = top.map((row, index) => ({
    key: row.partyId || `party-${index}`,
    label: row.name || 'Party',
    value: Number(row.amount),
    color: PARTY_SLICE_COLORS[index % PARTY_SLICE_COLORS.length],
  }));
  if (rest.length > 0) {
    slices.push({
      key: 'others',
      label: `Others (${rest.length})`,
      value: rest.reduce((sum, row) => sum + Number(row.amount || 0), 0),
      color: '#90a4ae',
    });
  }
  return {
    slices,
    total: slices.reduce((sum, slice) => sum + slice.value, 0),
  };
}

function Donut({ title, note, donut, centerLabel, centerHint = 'complete' }) {
  const slices = donut?.slices || [];
  const total = slices.reduce((sum, slice) => sum + Number(slice.value || 0), 0);
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  const rings = slices.length === 1
    ? [{ ...slices[0], full: true }]
    : slices.map((slice) => {
        const length = total > 0 ? (Number(slice.value) / total) * circumference : 0;
        const ring = { ...slice, length, offset };
        offset += length;
        return ring;
      });

  return (
    <Card>
      <CardContent className="p-4">
        <h2 className="text-sm font-semibold" style={{ color: 'var(--md-on)' }}>{title}</h2>
        <p className="mt-1 text-xs" style={{ color: 'var(--md-dim)' }}>{note}</p>
        <div className="mt-4 flex items-center gap-4">
          <svg viewBox="0 0 120 120" className="h-32 w-32 shrink-0" role="img" aria-label={title}>
            <circle cx="60" cy="60" r={radius} fill="none" stroke="var(--md-border)" strokeWidth="14" />
            {rings.map((slice) => (
              <circle
                key={slice.key}
                cx="60"
                cy="60"
                r={radius}
                fill="none"
                stroke={sliceColor(slice)}
                strokeWidth="14"
                strokeDasharray={slice.full ? undefined : `${slice.length} ${circumference - slice.length}`}
                strokeDashoffset={slice.full ? undefined : -slice.offset}
                transform="rotate(-90 60 60)"
              />
            ))}
            <text
              x="60"
              y={centerLabel === '—' ? 66 : 58}
              textAnchor="middle"
              fontSize={centerLabel.length > 12 ? 9 : centerLabel.length > 8 ? 11 : 16}
              fontWeight="600"
              fill="var(--md-on)"
            >
              {centerLabel}
            </text>
            {centerLabel !== '—' && centerHint ? (
              <text x="60" y="74" textAnchor="middle" fontSize="8" fill="var(--md-dim)">
                {centerHint}
              </text>
            ) : null}
          </svg>
          <ul className="min-w-0 flex-1 space-y-2 text-xs">
            {slices.length === 0 ? (
              <li style={{ color: 'var(--md-muted)' }}>Nothing to chart yet.</li>
            ) : (
              slices.map((slice) => (
                <li key={slice.key} className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-2" style={{ color: 'var(--md-muted)' }} title={slice.label}>
                    <span
                      className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ background: sliceColor(slice) }}
                    />
                    <span className="truncate">{slice.label}</span>
                  </span>
                  <span className="font-medium" style={{ color: 'var(--md-on)' }}>{formatRupees(slice.value)}</span>
                </li>
              ))
            )}
            {donut?.overflow > 0 && (
              <li style={{ color: '#ef6c00' }}>
                Over by {formatRupees(donut.overflow)}
              </li>
            )}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}

function SummaryCard({ label, value, hint }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--md-dim)' }}>{label}</p>
        <p className="mt-1 text-xl font-semibold" style={{ color: 'var(--md-on)' }}>{value}</p>
        {hint ? <p className="mt-1 text-xs" style={{ color: 'var(--md-dim)' }}>{hint}</p> : null}
      </CardContent>
    </Card>
  );
}

function PartySuggest({ label, query, onQueryChange, onPick, allowCreate = false, onCreate, placeholder, inline = false }) {
  const boxRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState([]);
  const [loadingOptions, setLoadingOptions] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    setLoadingOptions(true);
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ limit: '8' });
        if (query.trim()) params.set('search', query.trim());
        const res = await fetch(`/api/parties?${params}`, { headers: authHeaders() });
        const json = await res.json();
        if (!cancelled) setOptions(json.success ? json.data || [] : []);
      } catch {
        if (!cancelled) setOptions([]);
      } finally {
        if (!cancelled) setLoadingOptions(false);
      }
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, query]);

  useEffect(() => {
    const close = (event) => {
      if (!boxRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const trimmed = query.trim();
  const exact = options.some((party) => party.name.toLowerCase() === trimmed.toLowerCase());
  const showCreate = allowCreate && trimmed && !exact && !loadingOptions;

  return (
    <div ref={boxRef} className="relative block text-xs font-semibold" style={{ color: 'var(--md-muted)' }}>
      {label}
      <input
        value={query}
        placeholder={placeholder}
        autoComplete="off"
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          onQueryChange(event.target.value);
          setOpen(true);
        }}
        className={`${fieldClass} pr-8`}
        style={fieldStyle}
      />
      {query ? (
        <button
          type="button"
          title="Clear"
          className="absolute right-2 top-7 rounded p-0.5"
          style={{ color: 'var(--md-dim)' }}
          onClick={() => onPick(null)}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      ) : null}
      {open ? (
        <div
          className={`${inline ? 'relative' : 'absolute z-30'} mt-1 max-h-56 w-full overflow-auto rounded-lg py-1 shadow-lg`}
          style={{ background: 'var(--md-surface)', border: '1px solid var(--md-border-strong)' }}
        >
          {loadingOptions && options.length === 0 ? (
            <p className="px-3 py-2 font-normal" style={{ color: 'var(--md-dim)' }}>Searching…</p>
          ) : null}
          {!loadingOptions && options.length === 0 && !showCreate ? (
            <p className="px-3 py-2 font-normal" style={{ color: 'var(--md-dim)' }}>No parties found.</p>
          ) : null}
          {options.map((party) => (
            <button
              key={party.id}
              type="button"
              className="block w-full px-3 py-2 text-left font-normal"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onPick(party);
                setOpen(false);
              }}
            >
              <span className="block font-medium" style={{ color: 'var(--md-on)' }}>{party.name}</span>
              <span className="block text-[11px]" style={{ color: 'var(--md-dim)' }}>
                {party.phoneNo}{party.gst ? ` · GST ${party.gst}` : ''}
              </span>
            </button>
          ))}
          {showCreate ? (
            <button
              type="button"
              className="block w-full px-3 py-2 text-left font-medium"
              style={{ color: 'var(--md-on)' }}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onCreate(trimmed);
                setOpen(false);
              }}
            >
              Add “{trimmed}” as a new party
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block text-xs font-semibold" style={{ color: 'var(--md-muted)' }}>
      {label}
      {children}
    </label>
  );
}

function Hint({ error, children }) {
  return (
    <span className="mt-1 block font-normal" style={{ color: error ? '#e57373' : 'var(--md-dim)' }}>
      {error || children}
    </span>
  );
}

function TreasuryBillLinks({ docs }) {
  const images = parseTreasuryBillDocs(docs);
  if (!images.length) return '—';
  return (
    <div className="flex max-w-[220px] flex-wrap gap-1.5">
      {images.map((image, index) => (
        image.path && IMAGE_EXT.test(image.path) ? (
          <a
            key={image.path}
            href={`/api/files/${image.path}`}
            target="_blank"
            rel="noreferrer"
            title={image.name}
            className="block h-10 w-10 overflow-hidden rounded"
            style={{ border: '1px solid var(--md-border-strong)' }}
          >
            <img src={`/api/files/${image.path}`} alt={image.name} className="h-full w-full object-cover" />
          </a>
        ) : image.path ? (
          <a
            key={image.path}
            href={`/api/files/${image.path}`}
            target="_blank"
            rel="noreferrer"
            title={image.name}
            className="inline-flex max-w-full items-center gap-1.5 text-xs font-medium underline"
            style={{ color: 'var(--md-primary)' }}
          >
            <FileTypeIcon fileName={image.name} size={20} />
            <span className="truncate">{image.name}</span>
          </a>
        ) : (
          <span key={`${image.name}-${index}`} className="text-xs">{image.name}</span>
        )
      ))}
    </div>
  );
}

function BillImageTile({ image, onRemove }) {
  const preview = image.url ? (
    <img src={image.url} alt={image.name} title={image.name} className="h-16 w-16 rounded object-cover" style={{ border: '1px solid var(--md-border-strong)' }} />
  ) : image.path && IMAGE_EXT.test(image.path) ? (
    <a href={`/api/files/${image.path}`} target="_blank" rel="noreferrer" title={image.name}>
      <img src={`/api/files/${image.path}`} alt={image.name} className="h-16 w-16 rounded object-cover" style={{ border: '1px solid var(--md-border-strong)' }} />
    </a>
  ) : image.path ? (
    <a
      href={`/api/files/${image.path}`}
      target="_blank"
      rel="noreferrer"
      title={image.name}
      className="flex h-16 w-16 flex-col items-center justify-center gap-1 rounded px-1 text-center text-[10px] font-medium"
      style={{ border: '1px solid var(--md-border-strong)', color: 'var(--md-primary)' }}
    >
      <FileTypeIcon fileName={image.name} size={26} />
      <span className="block w-full truncate">{image.name}</span>
    </a>
  ) : (
    <span
      title={image.name}
      className="flex h-16 w-16 flex-col items-center justify-center gap-1 rounded px-1 text-center text-[10px] font-medium"
      style={{ border: '1px solid var(--md-border-strong)', color: 'var(--md-on)' }}
    >
      <FileTypeIcon fileName={image.name} size={26} />
      <span className="block w-full truncate">{image.name}</span>
    </span>
  );

  return (
    <div className="relative">
      {preview}
      <button
        type="button"
        title="Remove file"
        onClick={onRemove}
        className="absolute -right-1 -top-1 rounded-full p-0.5"
        style={{ background: 'var(--md-surface)', color: 'var(--md-on)', border: '1px solid var(--md-border-strong)' }}
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

function BillImageField({ label, noun, files, setFiles, kept, setKept, setFormError, optional = false, anyFile = false }) {
  const [previews, setPreviews] = useState([]);

  useEffect(() => {
    const next = files.map((file, index) => ({
      key: `${index}-${file.name}-${file.size}-${file.lastModified}`,
      name: file.name,
      url: IMAGE_EXT.test(file.name) ? URL.createObjectURL(file) : '',
    }));
    setPreviews(next);
    return () => {
      next.forEach((item) => item.url && URL.revokeObjectURL(item.url));
    };
  }, [files]);

  return (
    <>
      <Field label={label}>
        <input
          type="file"
          accept={anyFile ? undefined : 'image/jpeg,image/png,image/webp,image/gif,.jpg,.jpeg,.png,.webp,.gif'}
          multiple
          onChange={(event) => {
            const picked = Array.from(event.target.files || []);
            event.target.value = '';
            if (!picked.length) return;
            const accepted = [];
            let message = '';
            for (const file of picked) {
              const error = treasuryImageError(file, noun, { anyFile });
              if (error) message = error;
              else accepted.push(file);
            }
            const room = TREASURY_IMAGE_MAX - kept.length - files.length;
            if (accepted.length > room) {
              setFormError(`You can attach up to ${TREASURY_IMAGE_MAX} ${noun.charAt(0).toLowerCase()}${noun.slice(1)}s.`);
              if (room > 0) setFiles((current) => [...current, ...accepted.slice(0, room)]);
              return;
            }
            if (accepted.length) setFiles((current) => [...current, ...accepted]);
            setFormError(message);
          }}
          className={fieldClass}
          style={fieldStyle}
        />
        <Hint>
          {anyFile
            ? `${optional ? 'Optional. ' : ''}Any file type, such as images, PDF, Word, or Excel. Up to ${TREASURY_IMAGE_MAX} files, 20MB each.`
            : `${optional ? 'Optional. ' : ''}JPG, PNG, WEBP, or GIF. Up to ${TREASURY_IMAGE_MAX} images, 20MB each.`}
        </Hint>
      </Field>
      {(kept.length > 0 || previews.length > 0) ? (
        <div className="flex flex-wrap gap-2">
          {kept.map((image, index) => (
            <BillImageTile
              key={image.path || `${image.name}-${index}`}
              image={image}
              onRemove={() => setKept((current) => current.filter((_, itemIndex) => itemIndex !== index))}
            />
          ))}
          {previews.map((preview, index) => (
            <BillImageTile
              key={preview.key}
              image={preview}
              onRemove={() => setFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))}
            />
          ))}
        </div>
      ) : null}
    </>
  );
}

export default function BillsPage() {
  const toast = useToast();
  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState('');
  const [summary, setSummary] = useState(null);
  const [payments, setPayments] = useState([]);
  const [bills, setBills] = useState([]);
  const [paymentPage, setPaymentPage] = useState(1);
  const [billPage, setBillPage] = useState(1);
  const [paymentPages, setPaymentPages] = useState(1);
  const [billPages, setBillPages] = useState(1);
  const [paymentTotal, setPaymentTotal] = useState(0);
  const [billTotal, setBillTotal] = useState(0);
  const [paymentSearchInput, setPaymentSearchInput] = useState('');
  const [billSearchInput, setBillSearchInput] = useState('');
  const [paymentSearch, setPaymentSearch] = useState('');
  const [billSearch, setBillSearch] = useState('');
  const [partyFilterQuery, setPartyFilterQuery] = useState('');
  const [partyFilterId, setPartyFilterId] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [modal, setModal] = useState(null);
  const [selected, setSelected] = useState(null);
  const [paymentForm, setPaymentForm] = useState(emptyPayment);
  const [paymentFiles, setPaymentFiles] = useState([]);
  const [keptImages, setKeptImages] = useState([]);
  const [billForm, setBillForm] = useState(emptyBill);
  const [billPaymentForm, setBillPaymentForm] = useState(emptyBillPayment);
  const [billFiles, setBillFiles] = useState([]);
  const [keptBillImages, setKeptBillImages] = useState([]);

  useEffect(() => {
    const timer = setTimeout(() => setPaymentSearch(paymentSearchInput.trim()), 300);
    return () => clearTimeout(timer);
  }, [paymentSearchInput]);

  useEffect(() => {
    const timer = setTimeout(() => setBillSearch(billSearchInput.trim()), 300);
    return () => clearTimeout(timer);
  }, [billSearchInput]);

  useEffect(() => {
    setPaymentPage(1);
  }, [paymentSearch, projectId]);

  useEffect(() => {
    setBillPage(1);
  }, [billSearch, partyFilterId, projectId]);

  useEffect(() => {
    const headers = authHeaders();
    fetch('/api/projects?limit=100', { headers })
      .then((res) => res.json())
      .then((json) => {
        if (json.success) setProjects(json.data || []);
      })
      .catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const headers = authHeaders();
      const paymentQuery = new URLSearchParams({
        page: String(paymentPage),
        limit: '10',
      });
      const billQuery = new URLSearchParams({
        page: String(billPage),
        limit: '10',
      });
      if (projectId) {
        paymentQuery.set('projectId', projectId);
        billQuery.set('projectId', projectId);
      }
      if (paymentSearch) paymentQuery.set('search', paymentSearch);
      if (billSearch) billQuery.set('search', billSearch);
      if (partyFilterId) billQuery.set('partyId', partyFilterId);

      const summaryQuery = new URLSearchParams();
      if (projectId) summaryQuery.set('projectId', projectId);
      if (partyFilterId) summaryQuery.set('partyId', partyFilterId);
      if (billSearch) summaryQuery.set('search', billSearch);
      const summaryUrl = summaryQuery.size
        ? `/api/bills/summary?${summaryQuery}`
        : '/api/bills/summary';
      const [summaryRes, paymentRes, billRes] = await Promise.all([
        fetch(summaryUrl, { headers }),
        fetch(`/api/project-payments?${paymentQuery}`, { headers }),
        fetch(`/api/boq-bills?${billQuery}`, { headers }),
      ]);
      const summaryJson = await summaryRes.json();
      const paymentJson = await paymentRes.json();
      const billJson = await billRes.json();
      if (!summaryJson.success) throw new Error(summaryJson.message || 'Could not load the bill summary.');
      if (!paymentJson.success) throw new Error(paymentJson.message || 'Could not load project payments.');
      if (!billJson.success) throw new Error(billJson.message || 'Could not load BOQ bills.');
      setSummary(summaryJson.data);
      setPayments(paymentJson.data || []);
      setBills(billJson.data || []);
      setPaymentPages(paymentJson.pagination?.totalPages || 1);
      setBillPages(billJson.pagination?.totalPages || 1);
      setPaymentTotal(paymentJson.pagination?.total || 0);
      setBillTotal(billJson.pagination?.total || 0);
    } catch (loadError) {
      setError(loadError.message || 'Could not load bills.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [projectId, paymentPage, billPage, paymentSearch, billSearch, partyFilterId]);

  useEffect(() => {
    load();
  }, [load]);

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === projectId) || null,
    [projects, projectId]
  );

  const scopeLabel = selectedProject?.name || 'All projects';
  const showPartyChart = Boolean(projectId || partyFilterId || billSearch);
  const partyDonut = useMemo(() => partyChartFromBills(summary?.partyBills), [summary]);
  const partyChartNote = partyFilterId && projectId
    ? 'Bill amount for the selected party on this project.'
    : partyFilterId
      ? 'Bill amount for the selected party.'
      : projectId
        ? 'Bill amount for each party on this project.'
        : 'Bill amount for each party in this search.';

  const fetchExportRows = useCallback(async () => {
    const headers = authHeaders();
    const paymentQuery = new URLSearchParams({ page: '1', limit: 'all' });
    const billQuery = new URLSearchParams({ page: '1', limit: 'all' });
    if (projectId) {
      paymentQuery.set('projectId', projectId);
      billQuery.set('projectId', projectId);
    }
    if (paymentSearch) paymentQuery.set('search', paymentSearch);
    if (billSearch) billQuery.set('search', billSearch);
    if (partyFilterId) billQuery.set('partyId', partyFilterId);
    const [paymentRes, billRes] = await Promise.all([
      fetch(`/api/project-payments?${paymentQuery}`, { headers }),
      fetch(`/api/boq-bills?${billQuery}`, { headers }),
    ]);
    const paymentJson = await paymentRes.json();
    const billJson = await billRes.json();
    if (!paymentJson.success) throw new Error(paymentJson.message || 'Could not load project payments.');
    if (!billJson.success) throw new Error(billJson.message || 'Could not load BOQ bills.');
    return {
      payments: paymentJson.data || [],
      bills: billJson.data || [],
    };
  }, [projectId, paymentSearch, billSearch, partyFilterId]);

  const exportCsv = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const rows = await fetchExportRows();
      const lines = [
        'Bills export',
        ['Scope', scopeLabel].map(csvCell).join(','),
        ['Budget', summary?.budget ?? ''].map(csvCell).join(','),
        ['Amount received', summary?.received ?? ''].map(csvCell).join(','),
        ['Still to receive', summary?.stillToReceive ?? ''].map(csvCell).join(','),
        ['Payment completion %', summary?.paymentPercent == null ? '' : Math.round(summary.paymentPercent * 10) / 10].map(csvCell).join(','),
        ['BOQ billed', summary?.boqBilled ?? ''].map(csvCell).join(','),
        ['BOQ paid', summary?.boqPaid ?? ''].map(csvCell).join(','),
        ['BOQ unpaid', summary?.boqUnpaid ?? ''].map(csvCell).join(','),
        '',
        'Project payments',
        ['Project', 'Bill no', 'Bill date', 'Payment received date', 'Treasury bill files', 'Amount received'].map(csvCell).join(','),
        ...rows.payments.map((row) =>
          [
            row.project?.name,
            row.billNo,
            formatDate(row.billDate),
            formatDate(row.paymentReceivedDate),
            treasuryBillDocLabel(row.treasuryBillDocs),
            row.amountReceived,
          ].map(csvCell).join(',')
        ),
        '',
        'BOQ bills',
        ['Project', 'Bill no', 'Bill date', 'Party', 'Phone', 'Bill files', 'Bill amount', 'Bill payment', 'Payment date'].map(csvCell).join(','),
        ...rows.bills.map((row) =>
          [
            row.project?.name,
            row.billNo,
            formatDate(row.billDate),
            partyNameOf(row),
            partyPhoneOf(row),
            treasuryBillDocLabel(row.billDocs),
            row.billAmount,
            row.billPayment,
            formatDate(row.billPaymentDate),
          ].map(csvCell).join(',')
        ),
      ];
      const stamp = new Date().toISOString().slice(0, 10);
      const slug = scopeLabel.replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'bills';
      downloadCsv(`bills-${slug}-${stamp}.csv`, lines);
      toast.success('Bills exported.');
    } catch (exportError) {
      toast.error(exportError.message || 'Could not export bills.');
    } finally {
      setExporting(false);
    }
  };

  const printBills = async () => {
    if (printing) return;
    setPrinting(true);
    try {
      const rows = await fetchExportRows();
      const escape = (value) => String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
      const money = (value) => escape(formatRupees(value));
      const paymentRows = rows.payments.length
        ? rows.payments.map((row) => `
            <tr>
              <td>${escape(row.project?.name)}</td>
              <td>${escape(row.billNo)}</td>
              <td>${escape(formatDate(row.billDate))}</td>
              <td>${escape(formatDate(row.paymentReceivedDate))}</td>
              <td>${escape(treasuryBillDocLabel(row.treasuryBillDocs))}</td>
              <td>${money(row.amountReceived)}</td>
            </tr>`).join('')
        : '<tr><td colspan="6">No project payments.</td></tr>';
      const billRows = rows.bills.length
        ? rows.bills.map((row) => `
            <tr>
              <td>${escape(row.project?.name)}</td>
              <td>${escape(row.billNo)}</td>
              <td>${escape(formatDate(row.billDate))}</td>
              <td>${escape(partyNameOf(row))}</td>
              <td>${escape(partyPhoneOf(row))}</td>
              <td>${escape(treasuryBillDocLabel(row.billDocs))}</td>
              <td>${money(row.billAmount)}</td>
              <td>${money(row.billPayment)}</td>
              <td>${escape(formatDate(row.billPaymentDate))}</td>
            </tr>`).join('')
        : '<tr><td colspan="9">No BOQ bills.</td></tr>';
      const popup = window.open('', '_blank');
      if (!popup) {
        toast.error('Allow pop-ups to print this page.');
        return;
      }
      popup.document.write(`<!DOCTYPE html><html><head><title>Bills · ${escape(scopeLabel)}</title>
        <style>
          body { font-family: Arial, sans-serif; color: #111; padding: 24px; }
          h1 { font-size: 20px; margin: 0 0 4px; }
          h2 { font-size: 15px; margin: 24px 0 8px; }
          p, td, th { font-size: 12px; }
          .meta { color: #555; margin: 0 0 16px; }
          .cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 16px 0; }
          .card { border: 1px solid #ccc; padding: 8px 10px; }
          .card span { display: block; color: #666; font-size: 10px; text-transform: uppercase; }
          .card strong { display: block; margin-top: 4px; font-size: 14px; }
          table { width: 100%; border-collapse: collapse; }
          th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: left; }
          th { background: #f3f3f3; }
        </style></head><body>
          <h1>Bills</h1>
          <p class="meta">${escape(scopeLabel)} · Printed ${escape(new Date().toLocaleString('en-IN'))}</p>
          <div class="cards">
            <div class="card"><span>Budget</span><strong>${money(summary?.budget)}</strong></div>
            <div class="card"><span>Amount received</span><strong>${money(summary?.received)}</strong></div>
            <div class="card"><span>Still to receive</span><strong>${summary?.hasBudget ? money(summary.stillToReceive) : '—'}</strong></div>
            <div class="card"><span>Payment completion</span><strong>${escape(formatPercent(summary?.paymentPercent))}</strong></div>
            <div class="card"><span>BOQ billed</span><strong>${money(summary?.boqBilled)}</strong></div>
            <div class="card"><span>BOQ paid</span><strong>${money(summary?.boqPaid)}</strong></div>
            <div class="card"><span>BOQ unpaid</span><strong>${money(summary?.boqUnpaid)}</strong></div>
            <div class="card"><span>BOQ paid %</span><strong>${escape(formatPercent(summary?.boqPaidPercent))}</strong></div>
          </div>
          <h2>Project payments (${rows.payments.length})</h2>
          <table><thead><tr><th>Project</th><th>Bill no</th><th>Bill date</th><th>Payment received</th><th>Treasury bill files</th><th>Amount received</th></tr></thead>
          <tbody>${paymentRows}</tbody></table>
          <h2>BOQ bills (${rows.bills.length})</h2>
          <table><thead><tr><th>Project</th><th>Bill no</th><th>Bill date</th><th>Party</th><th>Phone</th><th>Bill files</th><th>Bill amount</th><th>Bill payment</th><th>Payment date</th></tr></thead>
          <tbody>${billRows}</tbody></table>
        </body></html>`);
      popup.document.close();
      popup.focus();
      popup.print();
    } catch (printError) {
      toast.error(printError.message || 'Could not print bills.');
    } finally {
      setPrinting(false);
    }
  };

  const openPayment = (row) => {
    setSelected(row || null);
    setPaymentForm(row ? {
      projectId: row.projectId || row.project?.id || projectId || '',
      billDate: dateInputValue(row.billDate),
      billNo: row.billNo == null ? '' : String(row.billNo),
      paymentReceivedDate: dateInputValue(row.paymentReceivedDate),
      amountReceived: row.amountReceived == null ? '' : String(row.amountReceived),
    } : { ...emptyPayment, projectId });
    setKeptImages(row ? parseTreasuryBillDocs(row.treasuryBillDocs) : []);
    setPaymentFiles([]);
    setFormError('');
    setModal('payment');
  };

  const openBill = (row) => {
    setSelected(row || null);
    setBillForm(row ? {
      projectId: row.projectId || row.project?.id || projectId || '',
      billDate: dateInputValue(row.billDate),
      billNo: row.billNo == null ? '' : String(row.billNo),
      billAmount: row.billAmount == null ? '' : String(row.billAmount),
      partyId: row.partyId || row.party?.id || '',
      partyName: partyNameOf(row),
      partyIsNew: false,
      partyPhone: partyPhoneOf(row),
      gst: '',
      phoneNo: '',
      billPayment: row.billPayment == null ? '' : String(row.billPayment),
      billPaymentDate: dateInputValue(row.billPaymentDate),
    } : { ...emptyBill, projectId });
    setKeptBillImages(row ? parseTreasuryBillDocs(row.billDocs) : []);
    setBillFiles([]);
    setFormError('');
    setModal('bill');
  };

  const openBillPayment = (row) => {
    setSelected(row);
    setBillPaymentForm({
      billPayment: row.billPayment == null ? '' : String(row.billPayment),
      billPaymentDate: dateInputValue(row.billPaymentDate),
      billAmount: row.billAmount == null ? '' : String(row.billAmount),
    });
    setFormError('');
    setModal('bill-payment');
  };

  const savePayment = async (event) => {
    event.preventDefault();
    if (saving) return;
    if (!paymentForm.projectId) {
      setFormError('Select a project.');
      return;
    }
    const amountMessage = amountError(paymentForm.amountReceived, 'Amount received');
    const fileMessage = treasuryImagesError(paymentFiles, {
      existingCount: keptImages.filter((image) => image.path).length,
      label: 'Treasury bill file',
      anyFile: true,
    });
    if (amountMessage || fileMessage) {
      setFormError(amountMessage || fileMessage);
      return;
    }
    setSaving(true);
    setFormError('');
    try {
      const body = new FormData();
      body.append('projectId', paymentForm.projectId);
      body.append('billDate', paymentForm.billDate);
      body.append('billNo', normalizeBillNoInput(paymentForm.billNo));
      body.append('paymentReceivedDate', paymentForm.paymentReceivedDate);
      body.append('amountReceived', paymentForm.amountReceived.trim());
      if (selected) {
        body.append('retained', JSON.stringify(keptImages.map((image) => image.path).filter(Boolean)));
      }
      paymentFiles.forEach((file) => body.append('files', file));
      const res = await fetch(selected ? `/api/project-payments/${selected.id}` : '/api/project-payments', {
        method: selected ? 'PUT' : 'POST',
        headers: authHeaders(),
        body,
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setFormError(json.message || 'Could not save this payment.');
        return;
      }
      toast.success(selected ? 'Project payment updated.' : 'Project payment added.');
      setModal(null);
      await load();
    } catch {
      setFormError('Network error while saving.');
    } finally {
      setSaving(false);
    }
  };

  const saveBill = async (event) => {
    event.preventDefault();
    if (saving) return;
    if (!billForm.projectId) {
      setFormError('Select a project.');
      return;
    }
    const amountMessage = amountError(billForm.billAmount, 'Bill amount');
    const paidMessage = amountError(billForm.billPayment, 'Bill payment', { allowZero: true, required: false });
    const overMessage = paymentExceedsBill(billForm.billPayment, billForm.billAmount);
    const fileMessage = treasuryImagesError(billFiles, {
      existingCount: keptBillImages.filter((image) => image.path).length,
      label: 'Bill file',
      required: false,
      anyFile: true,
    });
    if (amountMessage || paidMessage || overMessage || fileMessage) {
      setFormError(amountMessage || paidMessage || overMessage || fileMessage);
      return;
    }
    if (!billForm.partyId && !billForm.partyIsNew) {
      setFormError('Choose a party from the suggestions, or add a new party.');
      return;
    }
    if (billForm.partyIsNew && !billForm.phoneNo.trim()) {
      setFormError('Phone number is required for a new party.');
      return;
    }
    setSaving(true);
    setFormError('');
    try {
      let partyId = billForm.partyId;
      if (!partyId) {
        const partyRes = await fetch('/api/parties', {
          method: 'POST',
          headers: authHeaders(true),
          body: JSON.stringify({
            name: billForm.partyName.trim(),
            phoneNo: billForm.phoneNo.trim(),
            gst: billForm.gst.trim(),
          }),
        });
        const partyJson = await partyRes.json();
        if (!partyRes.ok || !partyJson.success) {
          setFormError(partyJson.message || 'Could not add this party.');
          return;
        }
        partyId = partyJson.data?.id;
        if (!partyId) {
          setFormError('Could not add this party.');
          return;
        }
        setBillForm((current) => ({
          ...current,
          partyId,
          partyIsNew: false,
          partyPhone: partyJson.data?.phoneNo || current.phoneNo,
        }));
      }
      const body = new FormData();
      body.append('projectId', billForm.projectId);
      body.append('billDate', billForm.billDate);
      body.append('billNo', normalizeBillNoInput(billForm.billNo));
      body.append('billAmount', billForm.billAmount.trim());
      body.append('partyId', partyId);
      body.append('billPayment', billForm.billPayment.trim());
      body.append('billPaymentDate', billForm.billPaymentDate);
      if (selected) {
        body.append('retained', JSON.stringify(keptBillImages.map((image) => image.path).filter(Boolean)));
      }
      billFiles.forEach((file) => body.append('files', file));
      const res = await fetch(selected ? `/api/boq-bills/${selected.id}` : '/api/boq-bills', {
        method: selected ? 'PUT' : 'POST',
        headers: authHeaders(),
        body,
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setFormError(json.message || 'Could not save this bill.');
        return;
      }
      toast.success(selected ? 'BOQ bill updated.' : 'BOQ bill added.');
      setModal(null);
      await load();
    } catch {
      setFormError('Network error while saving.');
    } finally {
      setSaving(false);
    }
  };

  const saveBillPayment = async (event) => {
    event.preventDefault();
    if (saving || !selected) return;
    const paidMessage = amountError(billPaymentForm.billPayment, 'Bill payment', { allowZero: true, required: false });
    const overMessage = paymentExceedsBill(billPaymentForm.billPayment, billPaymentForm.billAmount);
    if (paidMessage || overMessage) {
      setFormError(paidMessage || overMessage);
      return;
    }
    setSaving(true);
    setFormError('');
    try {
      const res = await fetch(`/api/boq-bills/${selected.id}`, {
        method: 'PUT',
        headers: authHeaders(true),
        body: JSON.stringify({
          billPayment: billPaymentForm.billPayment.trim(),
          billPaymentDate: billPaymentForm.billPaymentDate,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setFormError(json.message || 'Could not update this bill payment.');
        return;
      }
      toast.success('BOQ bill payment updated.');
      setModal(null);
      await load();
    } catch {
      setFormError('Network error while saving.');
    } finally {
      setSaving(false);
    }
  };

  const amountReceivedError = paymentForm.amountReceived.trim()
    ? amountError(paymentForm.amountReceived, 'Amount received')
    : '';
  const billAmountError = billForm.billAmount.trim() ? amountError(billForm.billAmount, 'Bill amount') : '';
  const billPaymentError = billForm.billPayment.trim()
    ? amountError(billForm.billPayment, 'Bill payment', { allowZero: true })
    : '';
  const overBillError = paymentExceedsBill(billForm.billPayment, billForm.billAmount);
  const editPaymentError = billPaymentForm.billPayment.trim()
    ? amountError(billPaymentForm.billPayment, 'Bill payment', { allowZero: true })
    : '';
  const editOverBillError = paymentExceedsBill(billPaymentForm.billPayment, billPaymentForm.billAmount);

  const budgetHint = !summary
    ? ''
    : summary.hasBudget
      ? projectId ? 'From the project budget' : 'Sum of every project budget'
      : summary.budget === 0
        ? 'Budget is zero, so completion is not calculated'
        : projectId
          ? 'Set a budget on the project to calculate completion'
          : 'Set budgets on projects to calculate completion';

  return (
    <div className="space-y-4 pb-10">
      <ModuleHeader
        icon={PieChart}
        title="Bills"
        description="Enter project payments and BOQ bills, then see how far collections and party payments have gone against the project budget."
        actions={
          <>
          <Button variant="outline" size="sm" onClick={exportCsv} isLoading={exporting} disabled={loading}>
            <Download className="h-4 w-4" /> Export CSV
          </Button>
          <Button variant="outline" size="sm" onClick={printBills} isLoading={printing} disabled={loading}>
            <Printer className="h-4 w-4" /> Print
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setRefreshing(true);
              load();
            }}
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} /> Refresh
          </Button>
          </>
        }
      />

      <Card>
        <CardContent className="p-4">
          <label className="block max-w-md text-xs font-semibold" style={{ color: 'var(--md-muted)' }}>
            Project
            <select
              value={projectId}
              onChange={(event) => {
                setProjectId(event.target.value);
                setError('');
              }}
              className={fieldClass}
              style={fieldStyle}
            >
              <option value="">All projects</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>{project.name}</option>
              ))}
            </select>
          </label>
          {selectedProject ? (
            <p className="mt-2 text-xs" style={{ color: 'var(--md-dim)' }}>
              {selectedProject.status ? `${selectedProject.status} · ` : ''}
              Budget {formatRupees(selectedProject.budget)}
            </p>
          ) : (
            <p className="mt-2 text-xs" style={{ color: 'var(--md-dim)' }}>
              Showing every project payment and BOQ bill. Choose a project to filter.
            </p>
          )}
        </CardContent>
      </Card>

      {error && (
            <p className="rounded-lg px-3 py-2 text-sm" style={{ background: 'var(--md-surface2)', color: '#e57373' }}>
              {error}
            </p>
          )}

          <div className="relative space-y-4">
          {loading ? (
            <div
              className="absolute inset-0 z-20 flex items-start justify-center rounded-2xl"
              style={{ background: 'color-mix(in srgb, var(--md-bg) 78%, transparent)' }}
            >
              <LoadingState
                message="Loading bills"
                description="Fetching payments and BOQ bills."
                className="py-16"
              />
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <SummaryCard label={projectId ? 'Project budget' : 'Total budget'} value={formatRupees(summary?.budget)} hint={budgetHint} />
            <SummaryCard label="Amount received" value={formatRupees(summary?.received)} hint={`${summary?.paymentCount || 0} payment${summary?.paymentCount === 1 ? '' : 's'}`} />
            <SummaryCard label="Still to receive" value={summary?.hasBudget ? formatRupees(summary.stillToReceive) : '—'} hint={summary?.paymentOverflow > 0 ? `${formatRupees(summary.paymentOverflow)} over budget` : 'Budget minus amount received'} />
            <SummaryCard label="Payment completion" value={formatPercent(summary?.paymentPercent)} hint="Received compared with the project budget" />
            <SummaryCard label="BOQ billed" value={formatRupees(summary?.boqBilled)} hint={`${summary?.billCount || 0} bill${summary?.billCount === 1 ? '' : 's'}`} />
            <SummaryCard label="BOQ paid" value={formatRupees(summary?.boqPaid)} hint={formatPercent(summary?.boqPaidPercent) + ' of billed amount'} />
            <SummaryCard label="BOQ unpaid" value={formatRupees(summary?.boqUnpaid)} hint="Bill amount minus bill payment" />
          </div>

          <div className={`grid grid-cols-1 gap-3 ${showPartyChart ? 'xl:grid-cols-3' : 'xl:grid-cols-2'}`}>
            <Donut
              title="Payment completion"
              note={projectId ? 'Amount received against the project budget.' : 'Amount received against the combined project budget.'}
              donut={summary?.donuts?.payment}
              centerLabel={formatPercent(summary?.donuts?.payment?.percent)}
            />
            <Donut
              title="BOQ payment"
              note="How much of the BOQ bills has been paid."
              donut={summary?.donuts?.boqPayment}
              centerLabel={formatPercent(summary?.donuts?.boqPayment?.percent)}
            />
            {showPartyChart ? (
              <Donut
                title="Bills by party"
                note={partyChartNote}
                donut={partyDonut}
                centerLabel={partyDonut.total > 0 ? formatRupees(partyDonut.total) : '—'}
                centerHint="billed"
              />
            ) : null}
          </div>

          {!summary?.hasBudget && summary && (
            <p className="text-sm" style={{ color: 'var(--md-muted)' }}>
              {summary.budget === 0
                ? (projectId
                  ? 'This project budget is zero, so the completion rings stay empty until a budget greater than zero is saved on the project.'
                  : 'The combined project budget is zero, so the completion rings stay empty until budgets are saved.')
                : (projectId
                  ? 'This project has no budget yet, so the completion rings stay empty until a budget is saved on the project.'
                  : 'No project budgets are set yet, so the completion rings stay empty until budgets are saved.')}
            </p>
          )}

          <section className="space-y-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-base font-semibold" style={{ color: 'var(--md-on)' }}>Project payments</h2>
                <p className="text-xs" style={{ color: 'var(--md-dim)' }}>{paymentTotal} record{paymentTotal === 1 ? '' : 's'}</p>
              </div>
              <div className="flex flex-wrap items-end gap-2">
                <label className="relative text-xs font-semibold" style={{ color: 'var(--md-muted)' }}>
                  Search
                  <Search className="pointer-events-none absolute left-3 top-8 h-4 w-4" style={{ color: 'var(--md-dim)' }} />
                  <input
                    value={paymentSearchInput}
                    onChange={(event) => setPaymentSearchInput(event.target.value)}
                    placeholder="Bill no or treasury image"
                    className={`${fieldClass} pl-9`}
                    style={fieldStyle}
                  />
                </label>
                <Button variant="primary" size="sm" onClick={() => openPayment(null)}>
                  <Plus className="h-4 w-4" /> Add payment
                </Button>
              </div>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  {!projectId && <TableHead>Project</TableHead>}
                  <TableHead>Bill no</TableHead>
                  <TableHead>Bill date</TableHead>
                  <TableHead>Payment received</TableHead>
                  <TableHead>Treasury bill files</TableHead>
                  <TableHead>Amount received</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableLoadingState message="Loading bills…" cols={projectId ? 6 : 7} />
                ) : payments.length === 0 ? (
                  <TableEmptyState
                    colSpan={projectId ? 6 : 7}
                    icon={PieChart}
                    title="No project payments"
                    description={paymentSearch ? 'Nothing matches this search.' : (projectId ? 'Add the first payment received for this project.' : 'Add the first project payment.')}
                    action={!paymentSearch ? (
                      <Button variant="primary" size="sm" onClick={() => openPayment(null)}>
                        <Plus className="h-4 w-4" /> Add payment
                      </Button>
                    ) : null}
                  />
                ) : (
                  payments.map((row) => (
                    <TableRow key={row.id}>
                      {!projectId && <TableCell>{row.project?.name || '—'}</TableCell>}
                      <TableCell><span className="font-medium" style={{ color: 'var(--md-on)' }}>{row.billNo}</span></TableCell>
                      <TableCell>{formatDate(row.billDate)}</TableCell>
                      <TableCell>{formatDate(row.paymentReceivedDate)}</TableCell>
                      <TableCell>
                        <TreasuryBillLinks docs={row.treasuryBillDocs} />
                      </TableCell>
                      <TableCell><span className="font-medium" style={{ color: 'var(--md-on)' }}>{formatRupees(row.amountReceived)}</span></TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" title="Edit" onClick={() => openPayment(row)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
            <Pager page={paymentPage} pages={paymentPages} onPage={setPaymentPage} />
          </section>

          <section className="space-y-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-base font-semibold" style={{ color: 'var(--md-on)' }}>BOQ bills</h2>
                <p className="text-xs" style={{ color: 'var(--md-dim)' }}>{billTotal} record{billTotal === 1 ? '' : 's'}</p>
              </div>
              <div className="flex flex-wrap items-end gap-2">
                <div className="w-56">
                  <PartySuggest
                    label="Party"
                    query={partyFilterQuery}
                    placeholder="Search party name"
                    onQueryChange={(value) => {
                      setPartyFilterQuery(value);
                      setPartyFilterId('');
                    }}
                    onPick={(party) => {
                      if (!party) {
                        setPartyFilterQuery('');
                        setPartyFilterId('');
                        return;
                      }
                      setPartyFilterQuery(party.name);
                      setPartyFilterId(party.id);
                    }}
                  />
                </div>
                <label className="relative text-xs font-semibold" style={{ color: 'var(--md-muted)' }}>
                  Search
                  <Search className="pointer-events-none absolute left-3 top-8 h-4 w-4" style={{ color: 'var(--md-dim)' }} />
                  <input
                    value={billSearchInput}
                    onChange={(event) => setBillSearchInput(event.target.value)}
                    placeholder="Phone, bill no, or image"
                    className={`${fieldClass} pl-9`}
                    style={fieldStyle}
                  />
                </label>
                <Button variant="primary" size="sm" onClick={() => openBill(null)}>
                  <Plus className="h-4 w-4" /> Add BOQ bill
                </Button>
              </div>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  {!projectId && <TableHead>Project</TableHead>}
                  <TableHead>Bill no</TableHead>
                  <TableHead>Bill date</TableHead>
                  <TableHead>Party</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Bill files</TableHead>
                  <TableHead>Bill amount</TableHead>
                  <TableHead>Bill payment</TableHead>
                  <TableHead>Payment date</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableLoadingState message="Loading bills…" cols={projectId ? 9 : 10} />
                ) : bills.length === 0 ? (
                  <TableEmptyState
                    colSpan={projectId ? 9 : 10}
                    icon={PieChart}
                    title="No BOQ bills"
                    description={billSearch || partyFilterId ? 'Nothing matches this filter.' : (projectId ? 'Add the first party bill for this project.' : 'Add the first BOQ bill.')}
                    action={!billSearch && !partyFilterId ? (
                      <Button variant="primary" size="sm" onClick={() => openBill(null)}>
                        <Plus className="h-4 w-4" /> Add BOQ bill
                      </Button>
                    ) : null}
                  />
                ) : (
                  bills.map((row) => (
                    <TableRow key={row.id}>
                      {!projectId && <TableCell>{row.project?.name || '—'}</TableCell>}
                      <TableCell><span className="font-medium" style={{ color: 'var(--md-on)' }}>{row.billNo}</span></TableCell>
                      <TableCell>{formatDate(row.billDate)}</TableCell>
                      <TableCell>{partyNameOf(row) || '—'}</TableCell>
                      <TableCell>{partyPhoneOf(row) || '—'}</TableCell>
                      <TableCell>
                        <TreasuryBillLinks docs={row.billDocs} />
                      </TableCell>
                      <TableCell>{formatRupees(row.billAmount)}</TableCell>
                      <TableCell>{formatRupees(row.billPayment)}</TableCell>
                      <TableCell>{formatDate(row.billPaymentDate)}</TableCell>
                      <TableCell>
                        <div className="flex justify-end">
                          <Button variant="ghost" size="icon" title="Edit payment" onClick={() => openBillPayment(row)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
            <Pager page={billPage} pages={billPages} onPage={setBillPage} />
          </section>
          </div>

      <Modal
        isOpen={modal === 'payment'}
        onClose={() => setModal(null)}
        title={selected ? 'Update project payment' : 'Add project payment'}
        description="Treasury bill files are uploaded with the payment dates and amount."
        footer={
          <>
            <Button variant="outline" onClick={() => setModal(null)} disabled={saving}>Cancel</Button>
            <Button variant="primary" isLoading={saving} onClick={savePayment}>
              {selected ? 'Save changes' : 'Add payment'}
            </Button>
          </>
        }
      >
        <form onSubmit={savePayment} className="space-y-3">
          {formError && (
            <p className="rounded-lg px-3 py-2 text-sm" style={{ background: 'var(--md-surface)', color: '#e57373' }}>{formError}</p>
          )}
          <Field label="Project">
            <select
              required
              disabled={Boolean(selected)}
              value={paymentForm.projectId}
              onChange={(event) => setPaymentForm((current) => ({ ...current, projectId: event.target.value }))}
              className={fieldClass}
              style={fieldStyle}
            >
              <option value="">Select a project</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>{project.name}</option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Bill date">
              <input type="date" required value={paymentForm.billDate} onChange={(event) => setPaymentForm((current) => ({ ...current, billDate: event.target.value }))} className={fieldClass} style={fieldStyle} />
            </Field>
            <Field label="Payment received date">
              <input type="date" required value={paymentForm.paymentReceivedDate} onChange={(event) => setPaymentForm((current) => ({ ...current, paymentReceivedDate: event.target.value }))} className={fieldClass} style={fieldStyle} />
            </Field>
          </div>
          <Field label="Bill number">
            <input
              required
              maxLength={40}
              value={paymentForm.billNo}
              onChange={(event) => setPaymentForm((current) => ({ ...current, billNo: normalizeBillNoInput(event.target.value) }))}
              className={fieldClass}
              style={fieldStyle}
            />
            <Hint>Capital letters, digits, and special characters.</Hint>
          </Field>
          <BillImageField
            label="Treasury bill files"
            noun="Treasury bill file"
            anyFile
            files={paymentFiles}
            setFiles={setPaymentFiles}
            kept={keptImages}
            setKept={setKeptImages}
            setFormError={setFormError}
          />
          <Field label="Amount received (₹)">
            <input inputMode="numeric" required value={paymentForm.amountReceived} onChange={(event) => setPaymentForm((current) => ({ ...current, amountReceived: event.target.value }))} className={fieldClass} style={fieldStyle} />
            <Hint error={amountReceivedError}>Whole rupees only, greater than 0.</Hint>
          </Field>
        </form>
      </Modal>

      <Modal
        isOpen={modal === 'bill'}
        onClose={() => setModal(null)}
        title={selected ? 'Update BOQ bill' : 'Add BOQ bill'}
        description="Bill files are uploaded with the party bill, dates, and amounts."
        maxWidth="max-w-xl"
        footer={
          <>
            <Button variant="outline" onClick={() => setModal(null)} disabled={saving}>Cancel</Button>
            <Button variant="primary" isLoading={saving} onClick={saveBill}>
              {selected ? 'Save changes' : 'Add BOQ bill'}
            </Button>
          </>
        }
      >
        <form onSubmit={saveBill} className="space-y-3">
          {formError && (
            <p className="rounded-lg px-3 py-2 text-sm" style={{ background: 'var(--md-surface)', color: '#e57373' }}>{formError}</p>
          )}
          <Field label="Project">
            <select
              required
              disabled={Boolean(selected)}
              value={billForm.projectId}
              onChange={(event) => setBillForm((current) => ({ ...current, projectId: event.target.value }))}
              className={fieldClass}
              style={fieldStyle}
            >
              <option value="">Select a project</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>{project.name}</option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Bill date">
              <input type="date" required value={billForm.billDate} onChange={(event) => setBillForm((current) => ({ ...current, billDate: event.target.value }))} className={fieldClass} style={fieldStyle} />
            </Field>
            <Field label="Bill payment date">
              <input type="date" value={billForm.billPaymentDate} onChange={(event) => setBillForm((current) => ({ ...current, billPaymentDate: event.target.value }))} className={fieldClass} style={fieldStyle} />
              <Hint>Optional.</Hint>
            </Field>
          </div>
          <Field label="Bill number">
            <input
              required
              maxLength={40}
              value={billForm.billNo}
              onChange={(event) => setBillForm((current) => ({ ...current, billNo: normalizeBillNoInput(event.target.value) }))}
              className={fieldClass}
              style={fieldStyle}
            />
            <Hint>Capital letters, digits, and special characters.</Hint>
          </Field>
          <BillImageField
            label="Bill files"
            noun="Bill file"
            files={billFiles}
            setFiles={setBillFiles}
            kept={keptBillImages}
            setKept={setKeptBillImages}
            setFormError={setFormError}
            optional
            anyFile
          />
          <PartySuggest
            label="Party name"
            query={billForm.partyName}
            placeholder="Type a party name"
            allowCreate
            inline
            onQueryChange={(value) => setBillForm((current) => ({
              ...current,
              partyName: value,
              partyId: '',
              partyIsNew: false,
              partyPhone: '',
            }))}
            onPick={(party) => {
              if (!party) {
                setBillForm((current) => ({
                  ...current,
                  partyId: '',
                  partyName: '',
                  partyIsNew: false,
                  partyPhone: '',
                  gst: '',
                  phoneNo: '',
                }));
                return;
              }
              setBillForm((current) => ({
                ...current,
                partyId: party.id,
                partyName: party.name,
                partyPhone: party.phoneNo || '',
                partyIsNew: false,
                gst: '',
                phoneNo: '',
              }));
            }}
            onCreate={(name) => setBillForm((current) => ({
              ...current,
              partyName: name,
              partyId: '',
              partyIsNew: true,
            }))}
          />
          <Hint>
            {billForm.partyIsNew
              ? 'This name will be added as a new party.'
              : (billForm.partyId ? `Phone ${billForm.partyPhone || '—'}` : 'Type a name and choose a suggestion.')}
          </Hint>
          {billForm.partyIsNew ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Party phone number">
                <input required value={billForm.phoneNo} onChange={(event) => setBillForm((current) => ({ ...current, phoneNo: event.target.value }))} className={fieldClass} style={fieldStyle} />
                <Hint>Saved on the party.</Hint>
              </Field>
              <Field label="GST">
                <input
                  maxLength={15}
                  value={billForm.gst}
                  onChange={(event) => setBillForm((current) => ({ ...current, gst: event.target.value.toUpperCase() }))}
                  className={fieldClass}
                  style={fieldStyle}
                />
                <Hint>Optional. 15 letters and digits.</Hint>
              </Field>
            </div>
          ) : null}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Bill amount (₹)">
              <input inputMode="numeric" required value={billForm.billAmount} onChange={(event) => setBillForm((current) => ({ ...current, billAmount: event.target.value }))} className={fieldClass} style={fieldStyle} />
              <Hint error={billAmountError}>Whole rupees only, greater than 0.</Hint>
            </Field>
            <Field label="Bill payment (₹)">
              <input inputMode="numeric" value={billForm.billPayment} onChange={(event) => setBillForm((current) => ({ ...current, billPayment: event.target.value }))} className={fieldClass} style={fieldStyle} />
              <Hint error={billPaymentError || overBillError}>Optional. Whole rupees, or leave blank if nothing is paid yet.</Hint>
            </Field>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={modal === 'bill-payment'}
        onClose={() => setModal(null)}
        title="Update bill payment"
        description="Only the bill payment and payment date can be changed."
        footer={
          <>
            <Button variant="outline" onClick={() => setModal(null)} disabled={saving}>Cancel</Button>
            <Button variant="primary" isLoading={saving} onClick={saveBillPayment}>
              Save payment
            </Button>
          </>
        }
      >
        <form onSubmit={saveBillPayment} className="space-y-3">
          {formError && (
            <p className="rounded-lg px-3 py-2 text-sm" style={{ background: 'var(--md-surface)', color: '#e57373' }}>{formError}</p>
          )}
          <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-3" style={{ color: 'var(--md-muted)' }}>
            <p><span className="block text-xs font-semibold">Bill number</span><span style={{ color: 'var(--md-on)' }}>{selected?.billNo || '—'}</span></p>
            <p><span className="block text-xs font-semibold">Party</span><span style={{ color: 'var(--md-on)' }}>{partyNameOf(selected) || '—'}</span></p>
            <p><span className="block text-xs font-semibold">Bill amount</span><span style={{ color: 'var(--md-on)' }}>{formatRupees(selected?.billAmount)}</span></p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Bill payment (₹)">
              <input
                inputMode="numeric"
                value={billPaymentForm.billPayment}
                onChange={(event) => setBillPaymentForm((current) => ({ ...current, billPayment: event.target.value }))}
                className={fieldClass}
                style={fieldStyle}
              />
              <Hint error={editPaymentError || editOverBillError}>Optional. Whole rupees, or leave blank if nothing is paid yet.</Hint>
            </Field>
            <Field label="Payment date">
              <input
                type="date"
                value={billPaymentForm.billPaymentDate}
                onChange={(event) => setBillPaymentForm((current) => ({ ...current, billPaymentDate: event.target.value }))}
                className={fieldClass}
                style={fieldStyle}
              />
              <Hint>Optional.</Hint>
            </Field>
          </div>
        </form>
      </Modal>

    </div>
  );
}

function Pager({ page, pages, onPage }) {
  return (
    <div className="flex items-center justify-end gap-2 text-sm" style={{ color: 'var(--md-muted)' }}>
      <span>Page {page} of {pages}</span>
      <Button variant="outline" size="icon" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <Button variant="outline" size="icon" disabled={page >= pages} onClick={() => onPage(page + 1)}>
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}
