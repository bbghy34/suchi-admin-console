'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Receipt,
  Plus,
  Search,
  RefreshCw,
  Eye,
  Pencil,
  X,
  ChevronLeft,
  ChevronRight,
  Download,
  MapPin,
  IndianRupee,
  Calendar,
} from 'lucide-react';
import { useToast } from '@/components/providers/ToastProvider';
import { priceError, priceRangeError } from '@/lib/site-expense';
import { Card, CardContent } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import ModuleHeader from '@/components/layout/ModuleHeader';
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

const fieldClass = 'mt-1 block w-full rounded-lg px-3 py-2 text-sm outline-none';
const fieldStyle = {
  background: 'var(--md-sidebar)',
  border: '1px solid var(--md-border-strong)',
  color: 'var(--md-on)',
};

const emptyForm = { itemName: '', price: '', remarks: '', siteId: '', projectId: '' };

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

function formatWhen(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function csvCell(value) {
  const text = value == null ? '' : String(value);
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export default function SiteExpensesPage() {
  const toast = useToast();
  const [rows, setRows] = useState([]);
  const [projects, setProjects] = useState([]);
  const [sites, setSites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [priceTouched, setPriceTouched] = useState(false);

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [totalAmount, setTotalAmount] = useState('0');

  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [projectId, setProjectId] = useState('');
  const [siteId, setSiteId] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState('desc');

  const [modal, setModal] = useState(null);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState(emptyForm);

  const searchMounted = useRef(false);

  useEffect(() => {
    const next = searchInput.trim();
    const timer = setTimeout(() => {
      setSearchQuery((current) => (current === next ? current : next));
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    if (!searchMounted.current) {
      searchMounted.current = true;
      return;
    }
    setPage(1);
  }, [searchQuery]);

  const loadOptions = useCallback(async () => {
    try {
      const headers = authHeaders();
      const [projectRes, siteRes] = await Promise.all([
        fetch('/api/projects?limit=100', { headers }),
        fetch('/api/sites?dropdown=true', { headers }),
      ]);
      const projectJson = await projectRes.json();
      const siteJson = await siteRes.json();
      if (projectJson.success) setProjects(projectJson.data || []);
      if (siteJson.success) setSites(siteJson.data || []);
    } catch {
      // Filters still work; the dropdowns stay empty.
    }
  }, []);

  const queryString = useCallback(
    (extra = {}) => {
      const params = new URLSearchParams();
      params.set('page', String(extra.page ?? page));
      params.set('limit', String(extra.limit ?? limit));
      if (searchQuery) params.set('search', searchQuery);
      if (projectId) params.set('projectId', projectId);
      if (siteId) params.set('siteId', siteId);
      if (fromDate) params.set('fromDate', fromDate);
      if (toDate) params.set('toDate', toDate);
      const rangeMessage = priceRangeError(minPrice, maxPrice);
      if (!rangeMessage && minPrice.trim() && !priceError(minPrice, { allowZero: true })) {
        params.set('minPrice', minPrice.trim());
      }
      if (!rangeMessage && maxPrice.trim() && !priceError(maxPrice, { allowZero: true })) {
        params.set('maxPrice', maxPrice.trim());
      }
      params.set('sortBy', sortBy);
      params.set('sortOrder', sortOrder);
      return params.toString();
    },
    [page, limit, searchQuery, projectId, siteId, fromDate, toDate, minPrice, maxPrice, sortBy, sortOrder]
  );

  const loadRows = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/site-expenses?${queryString()}`, { headers: authHeaders() });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(json.message || 'Failed to load site expenses.');
        setRows([]);
        return;
      }
      setRows(json.data || []);
      setTotal(json.pagination?.total ?? 0);
      setTotalPages(json.pagination?.totalPages ?? 1);
      setTotalAmount(json.pagination?.totalAmount ?? '0');
    } catch {
      setError('Network error while loading site expenses.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [queryString]);

  useEffect(() => {
    loadOptions();
  }, [loadOptions]);

  useEffect(() => {
    loadRows();
  }, [loadRows]);

  const sitesForFilter = useMemo(() => {
    if (!projectId) return sites;
    return sites.filter((site) => site.projectId === projectId);
  }, [sites, projectId]);

  const sitesForForm = useMemo(() => {
    if (!form.projectId) return sites;
    return sites.filter((site) => site.projectId === form.projectId);
  }, [sites, form.projectId]);

  const activeFilters = [
    searchQuery,
    projectId,
    siteId,
    fromDate,
    toDate,
    minPrice.trim(),
    maxPrice.trim(),
  ].filter(Boolean).length;

  const resetFilters = () => {
    setSearchInput('');
    setSearchQuery('');
    setProjectId('');
    setSiteId('');
    setFromDate('');
    setToDate('');
    setMinPrice('');
    setMaxPrice('');
    setSortBy('createdAt');
    setSortOrder('desc');
    setPage(1);
  };

  const openCreate = () => {
    setSelected(null);
    setForm(emptyForm);
    setFormError('');
    setPriceTouched(false);
    setModal('form');
  };

  const openEdit = (row) => {
    setSelected(row);
    setForm({
      itemName: row.itemName || '',
      price: row.price == null ? '' : String(row.price),
      remarks: row.remarks || '',
      siteId: row.siteId || '',
      projectId: row.site?.projectId || row.site?.project?.id || '',
    });
    setFormError('');
    setPriceTouched(false);
    setModal('form');
  };

  const openView = (row) => {
    setSelected(row);
    setModal('view');
  };

  const submitForm = async (event) => {
    event.preventDefault();
    if (saving) return;
    setFormError('');
    const itemName = form.itemName.trim();
    const priceMessage = priceError(form.price);
    setPriceTouched(true);
    if (!itemName) {
      setFormError('Item name is required.');
      return;
    }
    if (priceMessage) {
      setFormError(priceMessage);
      return;
    }
    if (!form.siteId) {
      setFormError('Select a site.');
      return;
    }

    const payload = {
      itemName,
      price: form.price.trim(),
      siteId: form.siteId,
      remarks: form.remarks.trim() || null,
    };

    setSaving(true);
    try {
      const res = await fetch(selected ? `/api/site-expenses/${selected.id}` : '/api/site-expenses', {
        method: selected ? 'PUT' : 'POST',
        headers: authHeaders(true),
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setFormError(json.message || 'Could not save this expense.');
        return;
      }
      toast.success(selected ? 'Site expense updated.' : 'Site expense added.');
      setModal(null);
      await loadRows();
    } catch {
      setFormError('Network error while saving.');
    } finally {
      setSaving(false);
    }
  };

  const exportCsv = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const res = await fetch(`/api/site-expenses?${queryString({ page: 1, limit: 'all' })}`, {
        headers: authHeaders(),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        toast.error(json.message || 'Could not export expenses.');
        return;
      }
      const data = json.data || [];
      const header = ['Item name', 'Price (INR)', 'Site', 'Project', 'Remarks', 'Created by', 'Created at'];
      const lines = [
        header.join(','),
        ...data.map((row) =>
          [
            row.itemName,
            row.price,
            row.site?.name,
            row.site?.project?.name,
            row.remarks,
            row.creator?.name,
            formatWhen(row.createdAt),
          ]
            .map(csvCell)
            .join(',')
        ),
      ];
      const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'site-expenses.csv';
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Network error while exporting.');
    } finally { setExporting(false); }
  };

  const pageAmount = rows.reduce((sum, row) => sum + (Number(row.price) || 0), 0);

  return (
    <div className="space-y-4 pb-10">
      <ModuleHeader
        icon={Receipt}
        title="Site Expense"
        description="Record what was spent at a site, then correct the item, price, site, or remarks if something was entered wrong."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={exportCsv} isLoading={exporting} loadingLabel="Preparing CSV…" disabled={!total || loading}>
              <Download className="h-4 w-4" /> Export
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setRefreshing(true);
                loadRows();
              }}
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} /> Refresh
            </Button>
            <Button variant="primary" size="sm" onClick={openCreate}>
              <Plus className="h-4 w-4" /> Add expense
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--md-dim)' }}>
              Matching expenses
            </p>
            <p className="mt-1 text-2xl font-semibold" style={{ color: 'var(--md-on)' }}>{total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--md-dim)' }}>
              Total amount
            </p>
            <p className="mt-1 text-2xl font-semibold" style={{ color: 'var(--md-on)' }}>{formatRupees(totalAmount)}</p>
            <p className="mt-1 text-xs" style={{ color: 'var(--md-dim)' }}>Sum of every row that matches the filters</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--md-dim)' }}>
              This page
            </p>
            <p className="mt-1 text-2xl font-semibold" style={{ color: 'var(--md-on)' }}>{formatRupees(pageAmount)}</p>
            <p className="mt-1 text-xs" style={{ color: 'var(--md-dim)' }}>{rows.length} row{rows.length === 1 ? '' : 's'} shown</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            <label className="relative block text-xs font-semibold" style={{ color: 'var(--md-muted)' }}>
              Search
              <Search className="pointer-events-none absolute left-3 top-8 h-4 w-4" style={{ color: 'var(--md-dim)' }} />
              <input
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Item, remarks, or site"
                className={`${fieldClass} pl-9`}
                style={fieldStyle}
              />
            </label>
            <label className="block text-xs font-semibold" style={{ color: 'var(--md-muted)' }}>
              Project
              <select
                value={projectId}
                onChange={(event) => {
                  setProjectId(event.target.value);
                  setSiteId('');
                  setPage(1);
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
            <label className="block text-xs font-semibold" style={{ color: 'var(--md-muted)' }}>
              Site
              <select
                value={siteId}
                onChange={(event) => {
                  setSiteId(event.target.value);
                  setPage(1);
                }}
                className={fieldClass}
                style={fieldStyle}
              >
                <option value="">All sites</option>
                {sitesForFilter.map((site) => (
                  <option key={site.id} value={site.id}>{site.name}</option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-semibold" style={{ color: 'var(--md-muted)' }}>
              Sort
              <select
                value={`${sortBy}:${sortOrder}`}
                onChange={(event) => {
                  const [nextSort, nextOrder] = event.target.value.split(':');
                  setSortBy(nextSort);
                  setSortOrder(nextOrder);
                  setPage(1);
                }}
                className={fieldClass}
                style={fieldStyle}
              >
                <option value="createdAt:desc">Newest first</option>
                <option value="createdAt:asc">Oldest first</option>
                <option value="price:desc">Price: high to low</option>
                <option value="price:asc">Price: low to high</option>
                <option value="itemName:asc">Item name: A to Z</option>
                <option value="site:asc">Site: A to Z</option>
              </select>
            </label>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <label className="text-xs font-semibold" style={{ color: 'var(--md-muted)' }}>
              From
              <input
                type="date"
                value={fromDate}
                onChange={(event) => {
                  setFromDate(event.target.value);
                  setPage(1);
                }}
                className={fieldClass}
                style={fieldStyle}
              />
            </label>
            <label className="text-xs font-semibold" style={{ color: 'var(--md-muted)' }}>
              To
              <input
                type="date"
                value={toDate}
                onChange={(event) => {
                  setToDate(event.target.value);
                  setPage(1);
                }}
                className={fieldClass}
                style={fieldStyle}
              />
            </label>
            <label className="text-xs font-semibold" style={{ color: 'var(--md-muted)' }}>
              Min price
              <input
                inputMode="numeric"
                value={minPrice}
                onChange={(event) => {
                  setMinPrice(event.target.value);
                  setPage(1);
                }}
                placeholder="0"
                aria-invalid={Boolean(minPrice.trim() && priceError(minPrice, { allowZero: true }))}
                className={fieldClass}
                style={fieldStyle}
              />
              {minPrice.trim() && priceError(minPrice, { allowZero: true }) ? (
                <span className="mt-1 block font-normal" style={{ color: '#e57373' }}>
                  {priceError(minPrice, { allowZero: true }).replace(/^Price/, 'Min price')}
                </span>
              ) : null}
            </label>
            <label className="text-xs font-semibold" style={{ color: 'var(--md-muted)' }}>
              Max price
              <input
                inputMode="numeric"
                value={maxPrice}
                onChange={(event) => {
                  setMaxPrice(event.target.value);
                  setPage(1);
                }}
                placeholder="Any"
                aria-invalid={Boolean(maxPrice.trim() && priceError(maxPrice, { allowZero: true }))}
                className={fieldClass}
                style={fieldStyle}
              />
              {maxPrice.trim() && priceError(maxPrice, { allowZero: true }) ? (
                <span className="mt-1 block font-normal" style={{ color: '#e57373' }}>
                  {priceError(maxPrice, { allowZero: true }).replace(/^Price/, 'Max price')}
                </span>
              ) : null}
              {priceRangeError(minPrice, maxPrice) ? (
                <span className="mt-1 block font-normal" style={{ color: '#e57373' }}>
                  {priceRangeError(minPrice, maxPrice)}
                </span>
              ) : null}
            </label>
            {activeFilters > 0 && (
              <button
                type="button"
                onClick={resetFilters}
                className="mb-0.5 inline-flex items-center gap-1 text-xs font-semibold"
                style={{ color: 'var(--md-primary)' }}
              >
                <X className="h-3.5 w-3.5" /> Clear filters ({activeFilters})
              </button>
            )}
          </div>
        </CardContent>
      </Card>

      {error && (
        <p className="rounded-lg px-3 py-2 text-sm" style={{ background: 'var(--md-surface2)', color: '#e57373' }}>
          {error}
        </p>
      )}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Item</TableHead>
            <TableHead>Price</TableHead>
            <TableHead>Site</TableHead>
            <TableHead>Project</TableHead>
            <TableHead>Remarks</TableHead>
            <TableHead>Recorded</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableLoadingState message="Loading site expenses…" cols={7} />
          ) : rows.length === 0 ? (
            <TableEmptyState
              colSpan={7}
              icon={Receipt}
              title="No site expenses"
              description={activeFilters ? 'Nothing matches these filters.' : 'Add the first expense for a site.'}
              action={
                activeFilters ? (
                  <Button variant="outline" size="sm" onClick={resetFilters}>Clear filters</Button>
                ) : (
                  <Button variant="primary" size="sm" onClick={openCreate}>
                    <Plus className="h-4 w-4" /> Add expense
                  </Button>
                )
              }
            />
          ) : (
            rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell>
                  <span className="font-medium" style={{ color: 'var(--md-on)' }}>{row.itemName}</span>
                </TableCell>
                <TableCell>
                  <span className="font-medium" style={{ color: 'var(--md-on)' }}>{formatRupees(row.price)}</span>
                </TableCell>
                <TableCell>{row.site?.name || '—'}</TableCell>
                <TableCell>{row.site?.project?.name || '—'}</TableCell>
                <TableCell>
                  <span className="line-clamp-2 max-w-xs">{row.remarks || '—'}</span>
                </TableCell>
                <TableCell>
                  <div style={{ color: 'var(--md-on)' }}>{formatWhen(row.createdAt)}</div>
                  <div className="text-xs" style={{ color: 'var(--md-dim)' }}>{row.creator?.name || '—'}</div>
                </TableCell>
                <TableCell>
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="icon" onClick={() => openView(row)} title="View">
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => openEdit(row)} title="Edit">
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm" style={{ color: 'var(--md-muted)' }}>
        <label className="flex items-center gap-2">
          Rows
          <select
            value={limit}
            onChange={(event) => {
              setLimit(Number(event.target.value));
              setPage(1);
            }}
            className="rounded-lg px-2 py-1"
            style={fieldStyle}
          >
            {[10, 25, 50].map((size) => (
              <option key={size} value={size}>{size}</option>
            ))}
          </select>
        </label>
        <div className="flex items-center gap-2">
          <span>
            Page {page} of {totalPages}
          </span>
          <Button variant="outline" size="icon" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" disabled={page >= totalPages} onClick={() => setPage((current) => current + 1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <Modal
        isOpen={modal === 'form'}
        onClose={() => setModal(null)}
        title={selected ? 'Update expense' : 'Add expense'}
        description="Price is stored as whole rupees."
        footer={
          <>
            <Button variant="outline" onClick={() => setModal(null)} disabled={saving}>Cancel</Button>
            <Button variant="primary" isLoading={saving} onClick={submitForm}>
              {selected ? 'Save changes' : 'Add expense'}
            </Button>
          </>
        }
      >
        <form onSubmit={submitForm} className="space-y-3">
          {formError && (
            <p className="rounded-lg px-3 py-2 text-sm" style={{ background: 'var(--md-surface)', color: '#e57373' }}>
              {formError}
            </p>
          )}
          <label className="block text-xs font-semibold" style={{ color: 'var(--md-muted)' }}>
            Item name
            <input
              value={form.itemName}
              onChange={(event) => setForm((current) => ({ ...current, itemName: event.target.value }))}
              className={fieldClass}
              style={fieldStyle}
              maxLength={200}
              required
            />
          </label>
          <label className="block text-xs font-semibold" style={{ color: 'var(--md-muted)' }}>
            Price (₹)
            <input
              inputMode="numeric"
              value={form.price}
              onChange={(event) => setForm((current) => ({ ...current, price: event.target.value }))}
              onBlur={() => setPriceTouched(true)}
              placeholder="1500"
              aria-invalid={Boolean((form.price.trim() || priceTouched) && priceError(form.price))}
              className={fieldClass}
              style={fieldStyle}
              required
            />
            <span
              className="mt-1 block font-normal"
              style={{ color: (form.price.trim() || priceTouched) && priceError(form.price) ? '#e57373' : 'var(--md-dim)' }}
            >
              {(form.price.trim() || priceTouched) && priceError(form.price)
                ? priceError(form.price)
                : 'Whole rupees only, greater than 0.'}
            </span>
          </label>
          <label className="block text-xs font-semibold" style={{ color: 'var(--md-muted)' }}>
            Project
            <select
              value={form.projectId}
              onChange={(event) => setForm((current) => ({ ...current, projectId: event.target.value, siteId: '' }))}
              className={fieldClass}
              style={fieldStyle}
            >
              <option value="">All projects</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>{project.name}</option>
              ))}
            </select>
          </label>
          <label className="block text-xs font-semibold" style={{ color: 'var(--md-muted)' }}>
            Site
            <select
              value={form.siteId}
              onChange={(event) => setForm((current) => ({ ...current, siteId: event.target.value }))}
              className={fieldClass}
              style={fieldStyle}
              required
            >
              <option value="">Select a site</option>
              {sitesForForm.map((site) => (
                <option key={site.id} value={site.id}>{site.name}</option>
              ))}
            </select>
          </label>
          <label className="block text-xs font-semibold" style={{ color: 'var(--md-muted)' }}>
            Remarks
            <textarea
              value={form.remarks}
              onChange={(event) => setForm((current) => ({ ...current, remarks: event.target.value }))}
              rows={3}
              maxLength={2000}
              className={fieldClass}
              style={fieldStyle}
            />
          </label>
        </form>
      </Modal>

      <Modal
        isOpen={modal === 'view' && Boolean(selected)}
        onClose={() => setModal(null)}
        title={selected?.itemName || 'Expense'}
        description={formatRupees(selected?.price)}
        footer={
          <>
            <Button variant="outline" onClick={() => setModal(null)}>Close</Button>
            <Button
              variant="primary"
              onClick={() => {
                if (selected) openEdit(selected);
              }}
            >
              <Pencil className="h-4 w-4" /> Edit
            </Button>
          </>
        }
      >
        {selected && (
          <dl className="space-y-3 text-sm">
            <div className="flex items-start gap-2">
              <IndianRupee className="mt-0.5 h-4 w-4 shrink-0" style={{ color: 'var(--md-dim)' }} />
              <div>
                <dt style={{ color: 'var(--md-dim)' }}>Price</dt>
                <dd style={{ color: 'var(--md-on)' }}>{formatRupees(selected.price)}</dd>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0" style={{ color: 'var(--md-dim)' }} />
              <div>
                <dt style={{ color: 'var(--md-dim)' }}>Site</dt>
                <dd style={{ color: 'var(--md-on)' }}>
                  {selected.site?.name || '—'}
                  {selected.site?.project?.name ? ` · ${selected.site.project.name}` : ''}
                </dd>
              </div>
            </div>
            <div>
              <dt style={{ color: 'var(--md-dim)' }}>Remarks</dt>
              <dd className="whitespace-pre-wrap" style={{ color: 'var(--md-on)' }}>{selected.remarks || '—'}</dd>
            </div>
            <div className="flex items-start gap-2">
              <Calendar className="mt-0.5 h-4 w-4 shrink-0" style={{ color: 'var(--md-dim)' }} />
              <div>
                <dt style={{ color: 'var(--md-dim)' }}>Recorded</dt>
                <dd style={{ color: 'var(--md-on)' }}>
                  {formatWhen(selected.createdAt)} by {selected.creator?.name || '—'}
                </dd>
                {selected.updatedAt &&
                  selected.createdAt &&
                  Math.abs(new Date(selected.updatedAt) - new Date(selected.createdAt)) > 1000 && (
                  <dd className="text-xs" style={{ color: 'var(--md-dim)' }}>
                    Updated {formatWhen(selected.updatedAt)}
                    {selected.editor?.name ? ` by ${selected.editor.name}` : ''}
                  </dd>
                )}
              </div>
            </div>
          </dl>
        )}
      </Modal>
    </div>
  );
}
