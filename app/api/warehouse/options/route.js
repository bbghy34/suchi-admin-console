import { hideLuitAdminResponse } from '@/lib/luit-admin/privacy.mjs';
import prisma from '@/lib/prisma';
import { requireRoles } from '@/lib/auth';
import { successResponse as baseSuccessResponse, handleApiError } from '@/lib/api-response';
import { readCache, WAREHOUSE_OPTIONS_KEY } from '@/lib/read-cache';

const successResponse = (...args) => hideLuitAdminResponse(prisma, baseSuccessResponse, ...args);


function label(row) {
  if (!row) return '';
  return row.code ? `${row.code} — ${row.name}` : row.name;
}

const OPTIONS_TTL_MS = 45_000;

async function loadWarehouseOptions() {
    const [categories, units, materials, suppliers, projects, sites] = await Promise.all([
      prisma.materialCategory.findMany({ where: { isActive: true }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
      prisma.unit.findMany({ where: { isActive: true }, orderBy: { name: 'asc' }, select: { id: true, name: true, symbol: true } }),
      prisma.material.findMany({
        where: { isActive: true },
        orderBy: { name: 'asc' },
        select: { id: true, code: true, name: true, unit: { select: { symbol: true } } },
      }),
      prisma.supplier.findMany({ where: { isActive: true }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
      prisma.project.findMany({ where: { isActive: true }, orderBy: { name: 'asc' }, select: { id: true, name: true }, take: 200 }),
      prisma.site.findMany({ where: { isActive: true }, orderBy: { name: 'asc' }, select: { id: true, name: true, projectId: true }, take: 300 }),
    ]);

    return {
      categories: categories.map((row) => ({ id: row.id, label: row.name })),
      units: units.map((row) => ({ id: row.id, label: `${row.name} (${row.symbol})` })),
      materials: materials.map((row) => ({ id: row.id, label: `${row.code} — ${row.name}`, unit: row.unit?.symbol || '' })),
      suppliers: suppliers.map((row) => ({ id: row.id, label: label(row) })),
      projects: projects.map((row) => ({ id: row.id, label: row.name })),
      sites: sites.map((row) => ({ id: row.id, label: row.name, projectId: row.projectId })),
    };
}

export const GET = requireRoles(['A', 'M'])(async () => {
  try {
    const data = await readCache(WAREHOUSE_OPTIONS_KEY, OPTIONS_TTL_MS, loadWarehouseOptions);
    return successResponse(data, 'Warehouse options retrieved.');
  } catch (error) {
    return handleApiError(error, 'Failed to retrieve warehouse options.');
  }
});
