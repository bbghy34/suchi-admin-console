import { masterItem } from '@/lib/warehouse-master';

const item = masterItem({
  delegateName: 'supplier',
  label: 'Supplier',
  fields: [
    { key: 'name', label: 'Supplier name', required: true },
    { key: 'phone', label: 'Phone' },
    { key: 'email', label: 'Email' },
    { key: 'gstNumber', label: 'GST number' },
    { key: 'address', label: 'Address' },
  ],
});

export const PUT = item.PUT;
export const PATCH = item.PATCH;
export const DELETE = item.DELETE;
