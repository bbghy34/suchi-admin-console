import { masterItem } from '@/lib/warehouse-master';

const item = masterItem({
  delegateName: 'materialCategory',
  label: 'Category',
  fields: [
    { key: 'name', label: 'Category name', required: true },
    { key: 'description', label: 'Description' },
  ],
});

export const PUT = item.PUT;
export const PATCH = item.PATCH;
export const DELETE = item.DELETE;
