'use client';

import { Truck } from 'lucide-react';
import MasterPage from '@/components/warehouse/MasterPage';

export default function SuppliersPage() {
  return (
    <MasterPage
      icon={Truck}
      title="Suppliers"
      singular="Supplier"
      description="Vendors used on goods receipt notes."
      endpoint="/api/warehouse/suppliers"
      fields={[
        { key: 'name', label: 'Supplier name', required: true },
        { key: 'phone', label: 'Phone' },
        { key: 'email', label: 'Email' },
        { key: 'gstNumber', label: 'GST number' },
        { key: 'address', label: 'Address', type: 'textarea' },
      ]}
      columns={[
        { key: 'name', label: 'Name' },
        { key: 'phone', label: 'Phone' },
        { key: 'gstNumber', label: 'GST' },
      ]}
      guideId="warehouse-suppliers"
    />
  );
}
