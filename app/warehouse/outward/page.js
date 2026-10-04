'use client';

import { PackageMinus } from 'lucide-react';
import RecordPage from '@/components/warehouse/RecordPage';
import { formatWhen } from '@/components/warehouse/api';

export default function OutwardPage() {
  return (
    <RecordPage
      icon={PackageMinus}
      title="Outward (Issue)"
      description="Issue material to a project or site. The issue is refused when on-hand stock is not enough."
      endpoint="/api/warehouse/outward"
      submitLabel="Issue material"
      fields={[
        { key: 'materialId', label: 'Material', type: 'select', lookup: 'materials', required: true },
        { key: 'quantity', label: 'Quantity', type: 'number', required: true },
        { key: 'projectId', label: 'Project', type: 'select', lookup: 'projects' },
        { key: 'siteId', label: 'Site', type: 'select', lookup: 'sites', filterBy: 'projectId' },
        { key: 'purpose', label: 'Purpose' },
      ]}
      columns={[
        { key: 'issueNumber', label: 'Issue' },
        { key: 'issuedAt', label: 'Date', render: (row) => formatWhen(row.issuedAt) },
        { key: 'material', label: 'Material', render: (row) => row.material ? `${row.material.code} — ${row.material.name}` : '—' },
        { key: 'quantity', label: 'Qty', render: (row) => `${row.quantity} ${row.material?.unit?.symbol || ''}` },
        { key: 'project', label: 'Project', render: (row) => row.project?.name || '—' },
        { key: 'site', label: 'Site', render: (row) => row.site?.name || '—' },
      ]}
      guideId="warehouse-outward"
    />
  );
}
