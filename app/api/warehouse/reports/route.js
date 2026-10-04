import { hideLuitAdminResponse } from '@/lib/luit-admin/privacy.mjs';
import prisma from '@/lib/prisma';
import { requireRoles } from '@/lib/auth';
import { successResponse as baseSuccessResponse, errorResponse, handleApiError } from '@/lib/api-response';
import { loadMaterials, shapeStockRow } from '@/lib/warehouse';

const successResponse = (...args) => hideLuitAdminResponse(prisma, baseSuccessResponse, ...args);


export const GET = requireRoles(['A', 'M'])(async (request) => {
  try {
    const type = new URL(request.url).searchParams.get('type');

    if (type === 'stock') {
      const materials = await loadMaterials();
      return successResponse(materials.map(shapeStockRow), 'Stock report retrieved.');
    }

    if (type === 'inward') {
      const rows = await prisma.materialInward.findMany({
        where: { isActive: true },
        orderBy: { receivedAt: 'desc' },
        select: {
          id: true, grnNumber: true, receivedAt: true, quantity: true, rate: true,
          supplier: { select: { name: true } },
          material: { select: { code: true, name: true, unit: { select: { symbol: true } } } },
        },
      });
      return successResponse(rows.map((row) => ({
        id: row.id,
        grnNumber: row.grnNumber,
        receivedAt: row.receivedAt,
        supplier: row.supplier?.name || '',
        material: row.material ? `${row.material.code} — ${row.material.name}` : '',
        unit: row.material?.unit?.symbol || '',
        quantity: row.quantity,
        rate: row.rate,
        amount: Number(row.quantity) * Number(row.rate),
      })), 'Inward report retrieved.');
    }

    if (type === 'outward') {
      const rows = await prisma.materialOutward.findMany({
        where: { isActive: true },
        orderBy: { issuedAt: 'desc' },
        select: {
          id: true, issueNumber: true, issuedAt: true, quantity: true, purpose: true,
          material: { select: { code: true, name: true, unit: { select: { symbol: true } } } },
          project: { select: { name: true } },
          site: { select: { name: true } },
        },
      });
      return successResponse(rows.map((row) => ({
        id: row.id,
        issueNumber: row.issueNumber,
        issuedAt: row.issuedAt,
        material: row.material ? `${row.material.code} — ${row.material.name}` : '',
        unit: row.material?.unit?.symbol || '',
        project: row.project?.name || '',
        site: row.site?.name || '',
        quantity: row.quantity,
        purpose: row.purpose || '',
      })), 'Outward report retrieved.');
    }

    if (type === 'consumption') {
      // Aggregate at the database: one row per material, not one per issue.
      // The material itself may be inactive; historical consumption still counts.
      const rows = await prisma.$queryRaw`
        SELECT m.id, m.code || ' — ' || m.name AS material,
          COALESCE(u.symbol, '') AS unit, SUM(o.quantity) AS quantity
        FROM "MaterialOutward" o
        JOIN "Material" m ON m.id = o."materialId"
        LEFT JOIN "Unit" u ON u.id = m."unitId"
        WHERE o."isActive" = true
        GROUP BY m.id, m.code, m.name, u.symbol
      `;
      return successResponse(rows, 'Material consumption retrieved.');
    }

    if (type === 'valuation') {
      const [materials, totals] = await Promise.all([
        loadMaterials(),
        prisma.$queryRaw`
          SELECT "materialId", SUM(quantity) AS qty, SUM(quantity * rate) AS value
          FROM "MaterialInward"
          WHERE "isActive" = true
          GROUP BY "materialId"
        `,
      ]);
      const rates = new Map(totals.map((row) => [row.materialId, row]));
      const rows = materials.map((material) => {
        const stock = shapeStockRow(material);
        const rate = rates.get(material.id);
        const averageRate = rate && rate.qty > 0 ? rate.value / rate.qty : 0;
        return {
          ...stock,
          averageRate,
          value: stock.quantity * averageRate,
        };
      });
      return successResponse(rows, 'Stock valuation retrieved.');
    }

    return errorResponse('Unknown report type.', 400);
  } catch (error) {
    return handleApiError(error, 'Failed to build the report.');
  }
});
