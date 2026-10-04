'use client';
import AsyncStatus from '@/components/ui/AsyncStatus';

import { useEffect, useMemo, useState } from 'react';
import { BarChart3, Download, Printer } from 'lucide-react';
import { formatINR } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell, TableEmptyState,
} from '@/components/ui/Table';
import { formatWhen, warehouseApi } from './api';
import WorkflowGuide from '@/components/guide/WorkflowGuide';
import ModuleHeader from '@/components/layout/ModuleHeader';
import RowFilters from './RowFilters';

const money = (value) => formatINR(value, { fallback: '₹0.00' });

function displayCell(column, value) {
  if (column.kind === 'date') return formatWhen(value);
  if (column.kind === 'money') return money(value);
  if (column.kind === 'qty') return Number(value || 0).toLocaleString('en-IN');
  if (value == null || value === '') return '—';
  return String(value);
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

const printStyles = `
  .print-only { display: none; }
  @media print {
    @page { margin: 12mm; }
    html, body, .h-dvh, main, main > div {
      height: auto !important;
      overflow: visible !important;
      background: #fff !important;
      color: #111 !important;
    }
    .h-dvh { display: block !important; }
    aside, header:not(.module-header), footer, .no-print { display: none !important; }
    .module-header { border: 0 !important; padding: 0 !important; animation: none !important; }
    .module-header-icon { display: none !important; }
    .print-only { display: block !important; }
    .warehouse-report-sheet .overflow-x-auto {
      overflow: visible !important;
      background: #fff !important;
      box-shadow: none !important;
    }
    .warehouse-report-sheet h1,
    .warehouse-report-sheet p,
    .warehouse-report-sheet th,
    .warehouse-report-sheet td {
      color: #111 !important;
    }
    .warehouse-report-sheet table { width: 100% !important; border-collapse: collapse; }
    .warehouse-report-sheet th,
    .warehouse-report-sheet td {
      border-bottom: 1px solid #ccc !important;
      background: #fff !important;
    }
    .warehouse-report-sheet thead { display: table-header-group; }
  }
`;

export default function ReportView({ type, title, description, columns }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    warehouseApi(`/api/warehouse/reports?type=${type}`)
      .then((data) => { if (!cancelled) setRows(Array.isArray(data) ? data : []); })
      .catch((err) => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [type]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => columns.some((column) => String(row[column.key] ?? '').toLowerCase().includes(q)));
  }, [rows, query, columns]);

  const canExport = !loading && visible.length > 0;

  const exportCsv = () => {
    if (!canExport) return;
    const header = columns.map((column) => csvCell(column.label)).join(',');
    const lines = visible.map((row) => (
      columns.map((column) => csvCell(displayCell(column, row[column.key]))).join(',')
    ));
    const stamp = new Date().toISOString().slice(0, 10);
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    downloadCsv(`${slug}-${stamp}.csv`, [header, ...lines]);
  };

  return (
    <div className="warehouse-report-sheet space-y-4">
      <style>{printStyles}</style>
      <ModuleHeader
        icon={BarChart3}
        title={title}
        description={description}
        help={<span className="no-print"><WorkflowGuide id="warehouse-reports" /></span>}
        actions={(
          <div className="no-print flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => window.print()} disabled={!canExport}>
              <Printer className="h-4 w-4" />
              Print
            </Button>
            <Button variant="primary" size="sm" onClick={exportCsv} disabled={!canExport}>
              <Download className="h-4 w-4" />
              Export CSV
            </Button>
          </div>
        )}
      >
          <p className="print-only mt-1 text-xs">
            Printed {new Date().toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
            {query.trim() ? ` · Filtered by “${query.trim()}”` : ''}
            {` · ${visible.length} row${visible.length === 1 ? '' : 's'}`}
          </p>
      </ModuleHeader>
      <div className="no-print">
        <RowFilters query={query} onQuery={setQuery} placeholder="Search this report" />
      </div>
      {error && <p className="text-sm" style={{ color: '#ef9a9a' }}>{error}</p>}
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((column) => <TableHead key={column.key}>{column.label}</TableHead>)}
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRow><TableCell colSpan={columns.length}><AsyncStatus compact message={`Loading ${title}…`} description="Retrieving saved warehouse records." /></TableCell></TableRow>
          ) : visible.length === 0 ? (
            <TableEmptyState colSpan={columns.length} title="Nothing matches." description="Records appear after materials move in or out." />
          ) : visible.map((row) => (
            <TableRow key={row.id}>
              {columns.map((column) => (
                <TableCell key={column.key}>{displayCell(column, row[column.key])}</TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
