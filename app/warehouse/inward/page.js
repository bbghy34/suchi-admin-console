'use client';

import { PackagePlus } from 'lucide-react';
import RecordPage from '@/components/warehouse/RecordPage';
import { formatWhen } from '@/components/warehouse/api';
import { formatINR } from '@/lib/utils';

export default function InwardPage() {
  return (
    <RecordPage
      icon={PackagePlus}
      title="Inward (GRN)"
      description="Receive material from a supplier. Stock increases by the received quantity."
      endpoint="/api/warehouse/inward"
      submitLabel="Receive goods"
      fields={[
        { key: 'supplierId', label: 'Supplier', type: 'select', lookup: 'suppliers', required: true },
        { key: 'materialId', label: 'Material', type: 'select', lookup: 'materials', required: true },
        { key: 'quantity', label: 'Quantity', type: 'number', required: true },
        { key: 'rate', label: 'Rate (INR)', type: 'number', required: true },
        { key: 'remarks', label: 'Remarks' },
      ]}
      columns={[
        { key: 'grnNumber', label: 'GRN' },
        { key: 'receivedAt', label: 'Date', render: (row) => formatWhen(row.receivedAt) },
        { key: 'supplier', label: 'Supplier', render: (row) => row.supplier?.name || '—' },
        { key: 'material', label: 'Material', render: (row) => row.material ? `${row.material.code} — ${row.material.name}` : '—' },
        { key: 'quantity', label: 'Qty', render: (row) => `${row.quantity} ${row.material?.unit?.symbol || ''}` },
        { key: 'rate', label: 'Rate', render: (row) => formatINR(row.rate) },
      ]}
      guideId="warehouse-inward"
    />
  );
}
