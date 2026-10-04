'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell, TableEmptyState,
} from '@/components/ui/Table';
import { warehouseApi } from '@/components/warehouse/api';
import WorkflowGuide from '@/components/guide/WorkflowGuide';
import { Boxes } from 'lucide-react';
import ModuleHeader from '@/components/layout/ModuleHeader';
import RowFilters, { FilterSelect } from '@/components/warehouse/RowFilters';

export default function CurrentStockPage() {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState('');

  useEffect(() => {
    warehouseApi('/api/warehouse/stock')
      .then((data) => setRows(Array.isArray(data) ? data : []))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const categories = useMemo(
    () => [...new Set(rows.map((row) => row.category).filter(Boolean))].sort(),
    [rows],
  );
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (category && row.category !== category) return false;
      if (status === 'Low' && !row.isLow) return false;
      if (status === 'OK' && row.isLow) return false;
      if (!q) return true;
      return `${row.code} ${row.name}`.toLowerCase().includes(q);
    });
  }, [rows, query, category, status]);

  return (
    <div className="space-y-4">
      <ModuleHeader
        icon={Boxes}
        title="Current Stock"
        description="On-hand quantity for every active material."
        help={<WorkflowGuide id="warehouse-stock" />}
      />
      <RowFilters query={query} onQuery={setQuery} placeholder="Search code or material">
        <FilterSelect label="All categories" value={category} onChange={setCategory} options={categories} />
        <FilterSelect label="All stock levels" value={status} onChange={setStatus} options={['Low', 'OK']} />
      </RowFilters>
      {error && <p className="text-sm" style={{ color: '#ef9a9a' }}>{error}</p>}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Code</TableHead>
            <TableHead>Material</TableHead>
            <TableHead>Category</TableHead>
            <TableHead>On hand</TableHead>
            <TableHead>Minimum</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? <TableRow><TableCell colSpan={6}>Loading…</TableCell></TableRow> : visible.length === 0 ? (
            <TableEmptyState colSpan={6} title="No materials match." description="Try another category, stock level, or search." />
          ) : visible.map((row) => (
            <TableRow key={row.id}>
              <TableCell>{row.code}</TableCell>
              <TableCell>{row.name}</TableCell>
              <TableCell>{row.category || '—'}</TableCell>
              <TableCell>{row.quantity} {row.unit}</TableCell>
              <TableCell>{row.minStock}</TableCell>
              <TableCell>{row.isLow ? 'Low' : 'OK'}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
