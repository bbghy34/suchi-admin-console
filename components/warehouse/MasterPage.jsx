'use client';
import AsyncStatus from '@/components/ui/AsyncStatus';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Boxes, Plus, RefreshCw } from 'lucide-react';
import { useAuth } from '@/components/providers/AuthProvider';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell, TableEmptyState,
} from '@/components/ui/Table';
import { fieldClass, fieldStyle, readPath, warehouseApi } from './api';
import WorkflowGuide from '@/components/guide/WorkflowGuide';
import ModuleHeader from '@/components/layout/ModuleHeader';

function blankForm(fields) {
  return Object.fromEntries(fields.map((field) => [field.key, field.type === 'number' ? '' : '']));
}

export default function MasterPage({ title, singular = title, description, endpoint, fields, columns, guideId, facets = [], icon = Boxes }) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'A';
  const [rows, setRows] = useState([]);
  const [options, setOptions] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [facetValue, setFacetValue] = useState({});
  const [showInactive, setShowInactive] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(() => blankForm(fields));
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState(null);
  const [formError, setFormError] = useState('');

  const needsOptions = fields.some((field) => field.lookup);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (showInactive && isAdmin) params.set('includeInactive', 'true');
      const suffix = params.toString() ? `?${params}` : '';
      const [list, lookups] = await Promise.all([
        warehouseApi(`${endpoint}${suffix}`),
        needsOptions ? warehouseApi('/api/warehouse/options') : Promise.resolve({}),
      ]);
      setRows(Array.isArray(list) ? list : []);
      setOptions(lookups || {});
    } catch (err) {
      setError(err.message);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [endpoint, showInactive, isAdmin, needsOptions]);

  useEffect(() => { load(); }, [load]);

  const facetOptions = useMemo(() => {
    const options = {};
    facets.forEach((facet) => {
      const values = new Set();
      rows.forEach((row) => {
        const value = readPath(row, facet.key);
        if (value) values.add(String(value));
      });
      options[facet.key] = [...values].sort((a, b) => a.localeCompare(b));
    });
    return options;
  }, [rows, facets]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      const facetOk = facets.every((facet) => {
        const selected = facetValue[facet.key];
        if (!selected) return true;
        return String(readPath(row, facet.key) ?? '') === selected;
      });
      if (!facetOk) return false;
      if (!q) return true;
      return columns.some((column) => String(column.render ? column.render(row) : readPath(row, column.key) ?? '').toLowerCase().includes(q));
    });
  }, [rows, query, columns, facets, facetValue]);

  const openCreate = () => {
    setEditing(null);
    setForm(blankForm(fields));
    setFormError('');
    setOpen(true);
  };

  const openEdit = (row) => {
    setEditing(row);
    setForm(Object.fromEntries(fields.map((field) => [field.key, row[field.key] ?? ''])));
    setFormError('');
    setOpen(true);
  };

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    setFormError('');
    try {
      const payload = { ...form };
      fields.forEach((field) => {
        if (field.type === 'number' && payload[field.key] !== '') payload[field.key] = Number(payload[field.key]);
      });
      if (editing) await warehouseApi(`${endpoint}/${editing.id}`, { method: 'PUT', body: JSON.stringify(payload) });
      else await warehouseApi(endpoint, { method: 'POST', body: JSON.stringify(payload) });
      setOpen(false);
      await load();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (row) => {
    if (toggling) return;
    setToggling(row.id);
    setError('');
    try {
      await warehouseApi(`${endpoint}/${row.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: row.isActive === false }),
      });
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setToggling(null);
    }
  };

  return (
    <div className="space-y-4">
      <ModuleHeader
        icon={icon}
        title={title}
        description={description}
        help={guideId ? <WorkflowGuide id={guideId} /> : null}
        actions={(
          <>
            <Button variant="outline" size="sm" onClick={load}><RefreshCw className="h-4 w-4" /> Refresh</Button>
            <Button variant="primary" size="sm" onClick={openCreate}><Plus className="h-4 w-4" /> Add {singular.toLowerCase()}</Button>
          </>
        )}
      />

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search"
          className="h-9 w-full max-w-xs rounded-lg px-3 text-sm"
          style={fieldStyle}
        />
        {facets.map((facet) => (
          <select
            key={facet.key}
            value={facetValue[facet.key] || ''}
            onChange={(event) => setFacetValue((current) => ({ ...current, [facet.key]: event.target.value }))}
            className="h-9 rounded-lg px-3 text-sm"
            style={fieldStyle}
            aria-label={facet.label}
          >
            <option value="">{facet.label}</option>
            {(facetOptions[facet.key] || []).map((value) => (
              <option key={value} value={value}>{value}</option>
            ))}
          </select>
        ))}
        {isAdmin && (
          <label className="flex items-center gap-2 text-xs" style={{ color: 'var(--md-muted)' }}>
            <input type="checkbox" checked={showInactive} onChange={(event) => setShowInactive(event.target.checked)} />
            Show deactivated
          </label>
        )}
      </div>

      {error && <p className="rounded-lg px-3 py-2 text-sm" style={{ background: 'rgba(244,67,54,0.12)', color: '#ef9a9a' }}>{error}</p>}

      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((column) => <TableHead key={column.key}>{column.label}</TableHead>)}
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRow><TableCell colSpan={columns.length + 1}><AsyncStatus compact message={`Loading ${title}…`} description="Retrieving saved warehouse records." /></TableCell></TableRow>
          ) : visible.length === 0 ? (
            <TableEmptyState colSpan={columns.length + 1} title={`No ${title.toLowerCase()} yet.`} description={`Add a ${singular.toLowerCase()} to get started.`} />
          ) : visible.map((row) => (
            <TableRow key={row.id}>
              {columns.map((column) => (
                <TableCell key={column.key}>
                  {column.render ? column.render(row) : (readPath(row, column.key) || '—')}
                </TableCell>
              ))}
              <TableCell className="text-right">
                <div className="flex justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={() => openEdit(row)}>Edit</Button>
                  {isAdmin && (
                    <Button variant="ghost" size="sm" disabled={!!toggling} isLoading={toggling === row.id} loadingLabel="Updating…" onClick={() => toggleActive(row)}>
                      {row.isActive === false ? 'Activate' : 'Deactivate'}
                    </Button>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Modal
        isOpen={open}
        onClose={() => setOpen(false)}
        title={editing ? `Edit ${singular.toLowerCase()}` : `Add ${singular.toLowerCase()}`}
        maxWidth="max-w-lg"
      >
        <form onSubmit={save} className="space-y-3">
          {formError && <p className="text-sm" style={{ color: '#ef9a9a' }}>{formError}</p>}
          {fields.map((field) => (
            <label key={field.key} className="block text-xs font-semibold" style={{ color: 'var(--md-muted)' }}>
              {field.label}
              {field.type === 'textarea' ? (
                <textarea
                  rows={3}
                  value={form[field.key] ?? ''}
                  onChange={(event) => setForm((prev) => ({ ...prev, [field.key]: event.target.value }))}
                  className={fieldClass}
                  style={fieldStyle}
                />
              ) : field.type === 'select' ? (
                <select
                  required={field.required}
                  value={form[field.key] ?? ''}
                  onChange={(event) => setForm((prev) => ({ ...prev, [field.key]: event.target.value }))}
                  className={fieldClass}
                  style={fieldStyle}
                >
                  <option value="">Select</option>
                  {(options[field.lookup] || []).map((option) => (
                    <option key={option.id} value={option.id}>{option.label}</option>
                  ))}
                </select>
              ) : (
                <input
                  required={field.required}
                  type={field.type === 'number' ? 'number' : 'text'}
                  step={field.type === 'number' ? 'any' : undefined}
                  value={form[field.key] ?? ''}
                  onChange={(event) => setForm((prev) => ({ ...prev, [field.key]: event.target.value }))}
                  className={fieldClass}
                  style={fieldStyle}
                />
              )}
            </label>
          ))}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" variant="primary" size="sm" isLoading={saving}>Save</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
