import prisma from '@/lib/prisma';
import { masterItem } from '@/lib/warehouse-master';
import { StockError } from '@/lib/warehouse';

async function prepare(data) {
  data.code = String(data.code || '').toUpperCase();
  if (data.minStock < 0) throw new StockError('Minimum stock cannot be negative.');
  const [category, unit] = await Promise.all([
    prisma.materialCategory.findUnique({ where: { id: data.categoryId } }),
    prisma.unit.findUnique({ where: { id: data.unitId } }),
  ]);
  if (!category || category.isActive === false) throw new StockError('Choose an active category.');
  if (!unit || unit.isActive === false) throw new StockError('Choose an active unit.');
  return data;
}

const item = masterItem({
  delegateName: 'material',
  label: 'Material',
  include: { category: true, unit: true, stock: true },
  prepare,
  fields: [
    { key: 'code', label: 'Code', required: true },
    { key: 'name', label: 'Name', required: true },
    { key: 'categoryId', label: 'Category', required: true },
    { key: 'unitId', label: 'Unit', required: true },
    { key: 'minStock', label: 'Minimum stock', type: 'number', default: 0 },
    { key: 'description', label: 'Description' },
  ],
});

export const PUT = item.PUT;
export const PATCH = item.PATCH;
export const DELETE = item.DELETE;
