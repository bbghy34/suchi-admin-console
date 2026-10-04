'use client';

import { Package } from 'lucide-react';
import MasterPage from '@/components/warehouse/MasterPage';

export default function MaterialMasterPage() {
  return (
    <MasterPage
      icon={Package}
      title="Materials"
      singular="Material"
      description="Construction materials, their unit, category, and the minimum stock that triggers an admin alert."
      endpoint="/api/warehouse/materials"
      fields={[
        { key: 'code', label: 'Code', required: true },
        { key: 'name', label: 'Name', required: true },
        { key: 'categoryId', label: 'Category', type: 'select', lookup: 'categories', required: true },
        { key: 'unitId', label: 'Unit', type: 'select', lookup: 'units', required: true },
        { key: 'minStock', label: 'Minimum stock', type: 'number' },
        { key: 'description', label: 'Description', type: 'textarea' },
      ]}
      columns={[
        { key: 'code', label: 'Code' },
        { key: 'name', label: 'Name' },
        { key: 'category.name', label: 'Category' },
        { key: 'unit.symbol', label: 'Unit' },
        { key: 'minStock', label: 'Min stock' },
      ]}
      guideId="warehouse-materials"
      facets={[{ key: 'category.name', label: 'All categories' }]}
    />
  );
}
