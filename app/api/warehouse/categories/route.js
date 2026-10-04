import { masterCollection } from '@/lib/warehouse-master';

const config = {
  delegateName: 'materialCategory',
  label: 'Category',
  fields: [
    { key: 'name', label: 'Category name', required: true },
    { key: 'description', label: 'Description' },
  ],
};

const collection = masterCollection(config);
export const GET = collection.GET;
export const POST = collection.POST;
