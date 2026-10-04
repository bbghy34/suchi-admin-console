import { masterCollection } from '@/lib/warehouse-master';

const config = {
  delegateName: 'supplier',
  label: 'Supplier',
  fields: [
    { key: 'name', label: 'Supplier name', required: true },
    { key: 'phone', label: 'Phone' },
    { key: 'email', label: 'Email' },
    { key: 'gstNumber', label: 'GST number' },
    { key: 'address', label: 'Address' },
  ],
};

const collection = masterCollection(config);
export const GET = collection.GET;
export const POST = collection.POST;
