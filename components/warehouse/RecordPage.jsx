'use client';
import AsyncStatus from '@/components/ui/AsyncStatus';

import { useCallback, useEffect, useState } from 'react';
import { ArrowLeftRight, RefreshCw } from 'lucide-react';
import Button from '@/components/ui/Button';
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell, TableEmptyState,
} from '@/components/ui/Table';
import { fieldClass, fieldStyle, warehouseApi } from './api';
import WorkflowGuide from '@/components/guide/WorkflowGuide';
import ModuleHeader from '@/components/layout/ModuleHeader';

function blankForm(fields) {
  return Object.fromEntries(fields.map((field) => [field.key, field.default ?? '']));
}

export default function RecordPage({ title, description, endpoint, fields, columns, submitLabel = 'Save', guideId, icon = ArrowLeftRight }) {
  const [rows, setRows] = useState([]);
  const [options, setOptions] = useState({});
  const [form, setForm] = useState(() => blankForm(fields));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [list, lookups] = await Promise.all([
        warehouseApi(endpoint),
        warehouseApi('/api/warehouse/options'),
      ]);
      setRows(Array.isArray(list) ? list : []);
      setOptions(lookups || {});
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [endpoint]);

  useEffect(() => { load(); }, [load]);

  const setValue = (key, value) => {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      if (key === 'projectId') next.siteId = '';
      return next;
    });
  };

  const choices = (field) => {
    const list = field.options || options[field.lookup] || [];
    if (field.filterBy && form[field.filterBy]) {
      return list.filter((option) => option.projectId === form[field.filterBy]);
    }
    return list;
  };

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload = { ...form };
      fields.forEach((field) => {
        if (field.type === 'number' && payload[field.key] !== '') payload[field.key] = Number(payload[field.key]);
      });
      await warehouseApi(endpoint, { method: 'POST', body: JSON.stringify(payload) });
      setForm(blankForm(fields));
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <ModuleHeader
        icon={icon}
        title={title}
        description={description}
        help={guideId ? <WorkflowGuide id={guideId} /> : null}
        actions={<Button variant="outline" size="sm" onClick={load}><RefreshCw className="h-4 w-4" /> Refresh</Button>}
      />

      <form onSubmit={save} className="grid grid-cols-1 gap-3 rounded-xl p-4 md:grid-cols-2" style={{ background: 'var(--md-surface)', border: '1px solid var(--md-border)' }}>
        {fields.map((field) => (
          <label key={field.key} className="block text-xs font-semibold" style={{ color: 'var(--md-muted)' }}>
            {field.label}
            {field.type === 'select' ? (
              <select required={field.required} value={form[field.key] ?? ''} onChange={(event) => setValue(field.key, event.target.value)} className={fieldClass} style={fieldStyle}>
                <option value="">{field.placeholder || 'Select'}</option>
                {choices(field).map((option) => (
                  <option key={option.id} value={option.id}>{option.label}</option>
                ))}
              </select>
            ) : field.type === 'textarea' ? (
              <textarea rows={2} value={form[field.key] ?? ''} onChange={(event) => setValue(field.key, event.target.value)} className={fieldClass} style={fieldStyle} />
            ) : (
              <input
                required={field.required}
                type={field.type === 'number' ? 'number' : 'text'}
                step="any"
                min={field.type === 'number' ? '0' : undefined}
                value={form[field.key] ?? ''}
                onChange={(event) => setValue(field.key, event.target.value)}
                className={fieldClass}
                style={fieldStyle}
              />
            )}
          </label>
        ))}
        <div className="md:col-span-2 flex items-center justify-between gap-3">
          {error ? <p className="text-sm" style={{ color: '#ef9a9a' }}>{error}</p> : <span />}
          <Button type="submit" variant="primary" size="sm" isLoading={saving}>{submitLabel}</Button>
        </div>
      </form>

      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((column) => <TableHead key={column.key}>{column.label}</TableHead>)}
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRow><TableCell colSpan={columns.length}><AsyncStatus compact message={`Loading ${title}…`} description="Retrieving saved warehouse records." /></TableCell></TableRow>
          ) : rows.length === 0 ? (
            <TableEmptyState colSpan={columns.length} title="No records yet." description="Saved entries will appear here." />
          ) : rows.map((row) => (
            <TableRow key={row.id}>
              {columns.map((column) => (
                <TableCell key={column.key}>{column.render ? column.render(row) : (row[column.key] ?? '—')}</TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
