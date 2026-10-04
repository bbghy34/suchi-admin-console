import { masterCollection } from '@/lib/warehouse-master';

const config = {
  delegateName: 'unit',
  label: 'Unit',
  fields: [
    { key: 'name', label: 'Unit name', required: true },
    { key: 'symbol', label: 'Symbol', required: true },
  ],
};

const collection = masterCollection(config);
export const GET = collection.GET;
export const POST = collection.POST;
