'use client';
import AsyncStatus from '@/components/ui/AsyncStatus';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ClipboardList } from 'lucide-react';
import Button from '@/components/ui/Button';
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell, TableEmptyState,
} from '@/components/ui/Table';
import { fieldClass, fieldStyle, formatWhen, warehouseApi } from './api';
import WorkflowGuide from '@/components/guide/WorkflowGuide';
import ModuleHeader from '@/components/layout/ModuleHeader';
import RowFilters, { FilterSelect } from './RowFilters';

const empty = { materialId: '', projectId: '', siteId: '', quantity: '', remarks: '' };

export default function RequestPage() {
  const [rows, setRows] = useState([]);
  const [options, setOptions] = useState({ materials: [], projects: [], sites: [] });
  const [form, setForm] = useState(empty);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [acting, setActing] = useState(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [list, lookups] = await Promise.all([
        warehouseApi('/api/warehouse/requests'),
        warehouseApi('/api/warehouse/options'),
      ]);
      setRows(Array.isArray(list) ? list : []);
      setOptions(lookups || {});
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const sites = (options.sites || []).filter((site) => !form.projectId || site.projectId === form.projectId);
  const statuses = useMemo(() => [...new Set(rows.map((row) => row.status).filter(Boolean))].sort(), [rows]);
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (status && row.status !== status) return false;
      if (!q) return true;
      const material = row.material ? `${row.material.code} ${row.material.name}` : '';
      return `${material} ${row.project?.name || ''}`.toLowerCase().includes(q);
    });
  }, [rows, query, status]);

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await warehouseApi('/api/warehouse/requests', {
        method: 'POST',
        body: JSON.stringify({ ...form, quantity: Number(form.quantity) }),
      });
      setForm(empty);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const act = async (row, action) => {
    if (acting) return;
    setActing({id:row.id,action});
    setError('');
    try {
      await warehouseApi(`/api/warehouse/requests/${row.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ action }),
      });
      await load();
    } catch (err) {
      setError(err.message);
    } finally { setActing(null); }
  };

  return (
    <div className="space-y-4">
      <ModuleHeader
        icon={ClipboardList}
        title="Material Requests"
        description="Request stock for a project. Approving does not move stock. Issue does, and it is blocked when quantity is short."
        help={<WorkflowGuide id="warehouse-requests" />}
      />

      <form onSubmit={save} className="grid grid-cols-1 gap-3 rounded-xl p-4 md:grid-cols-2" style={{ background: 'var(--md-surface)', border: '1px solid var(--md-border)' }}>
        <label className="text-xs font-semibold" style={{ color: 'var(--md-muted)' }}>
          Material
          <select required value={form.materialId} onChange={(event) => setForm((prev) => ({ ...prev, materialId: event.target.value }))} className={fieldClass} style={fieldStyle}>
            <option value="">Select</option>
            {(options.materials || []).map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
          </select>
        </label>
        <label className="text-xs font-semibold" style={{ color: 'var(--md-muted)' }}>
          Quantity
          <input required type="number" min="0" step="any" value={form.quantity} onChange={(event) => setForm((prev) => ({ ...prev, quantity: event.target.value }))} className={fieldClass} style={fieldStyle} />
        </label>
        <label className="text-xs font-semibold" style={{ color: 'var(--md-muted)' }}>
          Project
          <select value={form.projectId} onChange={(event) => setForm((prev) => ({ ...prev, projectId: event.target.value, siteId: '' }))} className={fieldClass} style={fieldStyle}>
            <option value="">Optional</option>
            {(options.projects || []).map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
          </select>
        </label>
        <label className="text-xs font-semibold" style={{ color: 'var(--md-muted)' }}>
          Site
          <select value={form.siteId} onChange={(event) => setForm((prev) => ({ ...prev, siteId: event.target.value }))} className={fieldClass} style={fieldStyle}>
            <option value="">Optional</option>
            {sites.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
          </select>
        </label>
        <label className="text-xs font-semibold md:col-span-2" style={{ color: 'var(--md-muted)' }}>
          Remarks
          <input value={form.remarks} onChange={(event) => setForm((prev) => ({ ...prev, remarks: event.target.value }))} className={fieldClass} style={fieldStyle} />
        </label>
        <div className="md:col-span-2 flex items-center justify-between">
          {error ? <p className="text-sm" style={{ color: '#ef9a9a' }}>{error}</p> : <span />}
          <Button type="submit" variant="primary" size="sm" isLoading={saving}>Submit request</Button>
        </div>
      </form>

      <RowFilters query={query} onQuery={setQuery} placeholder="Search material or project">
        <FilterSelect label="All statuses" value={status} onChange={setStatus} options={statuses} />
      </RowFilters>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Material</TableHead>
            <TableHead>Qty</TableHead>
            <TableHead>Project</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRow><TableCell colSpan={6}><AsyncStatus compact message={`Loading ${'material requests'}…`} description="Retrieving saved warehouse records." /></TableCell></TableRow>
          ) : visible.length === 0 ? (
            <TableEmptyState colSpan={6} title="No requests match." description="Submitted requests stay here until they are issued or rejected." />
          ) : visible.map((row) => (
            <TableRow key={row.id}>
              <TableCell>{formatWhen(row.createdAt)}</TableCell>
              <TableCell>{row.material ? `${row.material.code} — ${row.material.name}` : '—'}</TableCell>
              <TableCell>{row.quantity} {row.material?.unit?.symbol || ''}</TableCell>
              <TableCell>{row.project?.name || '—'}</TableCell>
              <TableCell>{row.status}</TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-1">
                  {row.status === 'PENDING' && (
                    <>
                      <Button variant="outline" size="sm" disabled={!!acting} isLoading={acting?.id===row.id && acting?.action==='APPROVE'} loadingLabel="Approving…" onClick={() => act(row, 'APPROVE')}>Approve</Button>
                      <Button variant="ghost" size="sm" disabled={!!acting} isLoading={acting?.id===row.id && acting?.action==='REJECT'} loadingLabel="Rejecting…" onClick={() => act(row, 'REJECT')}>Reject</Button>
                    </>
                  )}
                  {row.status === 'APPROVED' && (
                    <Button variant="primary" size="sm" disabled={!!acting} isLoading={acting?.id===row.id && acting?.action==='ISSUE'} loadingLabel="Issuing stock…" onClick={() => act(row, 'ISSUE')}>Issue</Button>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
