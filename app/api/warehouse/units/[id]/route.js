import { masterItem } from '@/lib/warehouse-master';

const item = masterItem({
  delegateName: 'unit',
  label: 'Unit',
  fields: [
    { key: 'name', label: 'Unit name', required: true },
    { key: 'symbol', label: 'Symbol', required: true },
  ],
});

export const PUT = item.PUT;
export const PATCH = item.PATCH;
export const DELETE = item.DELETE;
