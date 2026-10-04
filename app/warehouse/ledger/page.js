'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell, TableEmptyState,
} from '@/components/ui/Table';
import { formatWhen, warehouseApi } from '@/components/warehouse/api';
import WorkflowGuide from '@/components/guide/WorkflowGuide';
import { ScrollText } from 'lucide-react';
import ModuleHeader from '@/components/layout/ModuleHeader';
import RowFilters, { FilterSelect } from '@/components/warehouse/RowFilters';

export default function StockLedgerPage() {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [movement, setMovement] = useState('');

  useEffect(() => {
    warehouseApi('/api/warehouse/ledger')
      .then((data) => setRows(Array.isArray(data) ? data : []))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const movements = useMemo(
    () => [...new Set(rows.map((row) => row.movement).filter(Boolean))].sort(),
    [rows],
  );
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (movement && row.movement !== movement) return false;
      if (!q) return true;
      const material = row.material ? `${row.material.code} ${row.material.name}` : '';
      return `${material} ${row.referenceType || ''} ${row.remarks || ''}`.toLowerCase().includes(q);
    });
  }, [rows, query, movement]);

  return (
    <div className="space-y-4">
      <ModuleHeader
        icon={ScrollText}
        title="Stock Ledger"
        description="Every receipt, issue, and adjustment, with the balance after the movement."
        help={<WorkflowGuide id="warehouse-ledger" />}
      />
      <RowFilters query={query} onQuery={setQuery} placeholder="Search material or reference">
        <FilterSelect label="All movements" value={movement} onChange={setMovement} options={movements} />
      </RowFilters>
      {error && <p className="text-sm" style={{ color: '#ef9a9a' }}>{error}</p>}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Material</TableHead>
            <TableHead>Movement</TableHead>
            <TableHead>Quantity</TableHead>
            <TableHead>Balance</TableHead>
            <TableHead>Reference</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? <TableRow><TableCell colSpan={6}>Loading…</TableCell></TableRow> : visible.length === 0 ? (
            <TableEmptyState colSpan={6} title="No movements match." description="Try another movement type or search." />
          ) : visible.map((row) => (
            <TableRow key={row.id}>
              <TableCell>{formatWhen(row.createdAt)}</TableCell>
              <TableCell>{row.material ? `${row.material.code} — ${row.material.name}` : '—'}</TableCell>
              <TableCell>{row.movement}</TableCell>
              <TableCell>{Number(row.quantity) > 0 ? '+' : ''}{row.quantity}</TableCell>
              <TableCell>{row.balanceAfter}</TableCell>
              <TableCell>{row.referenceType}{row.remarks ? ` · ${row.remarks}` : ''}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
