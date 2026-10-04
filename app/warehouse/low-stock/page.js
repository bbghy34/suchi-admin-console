'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/components/providers/AuthProvider';
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell, TableEmptyState,
} from '@/components/ui/Table';
import { warehouseApi } from '@/components/warehouse/api';
import WorkflowGuide from '@/components/guide/WorkflowGuide';
import { AlertTriangle } from 'lucide-react';
import ModuleHeader from '@/components/layout/ModuleHeader';
import RowFilters, { FilterSelect } from '@/components/warehouse/RowFilters';

export default function LowStockPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');

  useEffect(() => {
    warehouseApi('/api/warehouse/low-stock')
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
      if (!q) return true;
      return `${row.code} ${row.name}`.toLowerCase().includes(q);
    });
  }, [rows, query, category]);

  return (
    <div className="space-y-4">
      <ModuleHeader
        icon={AlertTriangle}
        title="Low Stock"
        description={(
          <>
            Materials whose on-hand quantity is at or below the minimum set on the material master.
            {user?.role === 'A' ? ' Admins also see this count in the top bar on every page.' : ''}
          </>
        )}
        help={<WorkflowGuide id="warehouse-low-stock" />}
      />
      <RowFilters query={query} onQuery={setQuery} placeholder="Search code or material">
        <FilterSelect label="All categories" value={category} onChange={setCategory} options={categories} />
      </RowFilters>
      {error && <p className="text-sm" style={{ color: '#ef9a9a' }}>{error}</p>}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Code</TableHead>
            <TableHead>Material</TableHead>
            <TableHead>On hand</TableHead>
            <TableHead>Minimum</TableHead>
            <TableHead>Shortfall</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? <TableRow><TableCell colSpan={5}>Loading…</TableCell></TableRow> : visible.length === 0 ? (
            <TableEmptyState colSpan={5} title="No low stock matches." description="A material appears here after its minimum stock is set and quantity falls to that level." />
          ) : visible.map((row) => (
            <TableRow key={row.id}>
              <TableCell>{row.code}</TableCell>
              <TableCell>{row.name}</TableCell>
              <TableCell>{row.quantity} {row.unit}</TableCell>
              <TableCell>{row.minStock}</TableCell>
              <TableCell>{Math.max(0, Number(row.minStock) - Number(row.quantity)).toLocaleString('en-IN')}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
