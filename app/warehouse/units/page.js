'use client';

import { Ruler } from 'lucide-react';
import MasterPage from '@/components/warehouse/MasterPage';

export default function UnitsPage() {
  return (
    <MasterPage
      icon={Ruler}
      title="Units"
      singular="Unit"
      description="Units of measure used on materials, receipts, and issues."
      endpoint="/api/warehouse/units"
      fields={[
        { key: 'name', label: 'Unit name', required: true },
        { key: 'symbol', label: 'Symbol', required: true },
      ]}
      columns={[
        { key: 'name', label: 'Name' },
        { key: 'symbol', label: 'Symbol' },
      ]}
      guideId="warehouse-units"
    />
  );
}
