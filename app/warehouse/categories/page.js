'use client';

import { Tags } from 'lucide-react';
import MasterPage from '@/components/warehouse/MasterPage';

export default function CategoriesPage() {
  return (
    <MasterPage
      icon={Tags}
      title="Categories"
      singular="Category"
      description="Groups such as cement, steel, aggregates, and consumables."
      endpoint="/api/warehouse/categories"
      fields={[
        { key: 'name', label: 'Category name', required: true },
        { key: 'description', label: 'Description', type: 'textarea' },
      ]}
      columns={[
        { key: 'name', label: 'Name' },
        { key: 'description', label: 'Description' },
      ]}
      guideId="warehouse-categories"
    />
  );
}
