'use client';

import { SlidersHorizontal } from 'lucide-react';
import RecordPage from '@/components/warehouse/RecordPage';
import { formatWhen } from '@/components/warehouse/api';

export default function StockAdjustmentPage() {
  return (
    <RecordPage
      icon={SlidersHorizontal}
      title="Stock Adjustment"
      description="Correct on-hand quantity after a count. A decrease is refused when it would take stock below zero."
      endpoint="/api/warehouse/adjustments"
      submitLabel="Post adjustment"
      fields={[
        { key: 'materialId', label: 'Material', type: 'select', lookup: 'materials', required: true },
        {
          key: 'direction',
          label: 'Direction',
          type: 'select',
          required: true,
          options: [
            { id: 'INCREASE', label: 'Increase' },
            { id: 'DECREASE', label: 'Decrease' },
          ],
        },
        { key: 'quantity', label: 'Quantity', type: 'number', required: true },
        { key: 'reason', label: 'Reason', required: true },
      ]}
      columns={[
        { key: 'createdAt', label: 'Date', render: (row) => formatWhen(row.createdAt) },
        { key: 'material', label: 'Material', render: (row) => row.material ? `${row.material.code} — ${row.material.name}` : '—' },
        { key: 'direction', label: 'Direction' },
        { key: 'quantity', label: 'Quantity' },
        { key: 'reason', label: 'Reason' },
      ]}
      guideId="warehouse-adjustments"
    />
  );
}
