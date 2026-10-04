import prisma from './prisma.js';

export class StockError extends Error {
  constructor(message) {
    super(message);
    this.name = 'StockError';
  }
}

export function docNo(prefix) {
  const now = new Date();
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${prefix}-${stamp}-${rand}`;
}

export function positiveNumber(value, label) {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) {
    return { ok: false, message: `${label} must be greater than zero.` };
  }
  return { ok: true, value: num };
}

export function nonNegativeNumber(value, label) {
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) {
    return { ok: false, message: `${label} must be zero or greater.` };
  }
  return { ok: true, value: num };
}

export async function assertSiteBelongsToProject(db, { siteId, projectId }) {
  if (!siteId) return;
  const site = await db.site.findUnique({
    where: { id: siteId },
    select: { id: true, projectId: true, isActive: true },
  });
  if (!site || site.isActive === false) {
    throw new StockError('Choose an active site.');
  }
  if (projectId && site.projectId && site.projectId !== projectId) {
    throw new StockError('That site does not belong to the selected project.');
  }
}

export function isLowStock(material) {
  const minimum = Number(material.minStock);
  const quantity = Number(material.stock?.quantity ?? 0);
  return minimum > 0 && quantity <= minimum;
}

export function shapeStockRow(material) {
  const quantity = Number(material.stock?.quantity ?? 0);
  return {
    id: material.id,
    code: material.code,
    name: material.name,
    category: material.category?.name || '',
    unit: material.unit?.symbol || material.unit?.name || '',
    quantity,
    minStock: Number(material.minStock) || 0,
    isLow: isLowStock(material),
    isActive: material.isActive,
  };
}

const materialInclude = {
  stock: true,
  unit: true,
  category: true,
};

export async function loadMaterials() {
  return prisma.material.findMany({
    where: { isActive: true },
    include: materialInclude,
    orderBy: { name: 'asc' },
  });
}

export async function loadLowStock() {
  const rows = await prisma.$queryRaw`
    SELECT
      m.id,
      m.code,
      m.name,
      m."minStock" AS "minStock",
      m."isActive" AS "isActive",
      c.name AS "categoryName",
      COALESCE(u.symbol, u.name, '') AS unit,
      COALESCE(s.quantity, 0) AS quantity
    FROM "Material" m
    LEFT JOIN "Stock" s ON s."materialId" = m.id
    LEFT JOIN "MaterialCategory" c ON c.id = m."categoryId"
    LEFT JOIN "Unit" u ON u.id = m."unitId"
    WHERE m."isActive" = true
      AND m."minStock" > 0
      AND COALESCE(s.quantity, 0) <= m."minStock"
    ORDER BY m.name ASC
  `;

  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    category: row.categoryName || '',
    unit: row.unit || '',
    quantity: Number(row.quantity),
    minStock: Number(row.minStock) || 0,
    isLow: true,
    isActive: row.isActive,
  }));
}

/**
 * Applies a stock in or out inside an existing transaction.
 * Quantity is always positive; direction is IN or OUT.
 */
export async function postStockMovement(tx, {
  materialId,
  direction,
  quantity,
  movement,
  referenceType,
  referenceId,
  remarks,
  createdBy,
}) {
  const material = await tx.material.findUnique({ where: { id: materialId } });
  if (!material || !material.isActive) {
    throw new StockError('Choose an active material.');
  }
  if (!(quantity > 0)) {
    throw new StockError('Quantity must be greater than zero.');
  }

  const signed = direction === 'OUT' ? -quantity : quantity;
  await tx.stock.upsert({
    where: { materialId },
    create: { materialId, quantity: 0 },
    update: {},
  });

  const updated = await tx.stock.update({
    where: { materialId },
    data: { quantity: { increment: signed } },
  });

  if (Number(updated.quantity) < -0.000001) {
    throw new StockError('Not enough stock for this issue.');
  }

  return tx.stockLedger.create({
    data: {
      materialId,
      movement,
      quantity: signed,
      balanceAfter: updated.quantity,
      referenceType,
      referenceId: referenceId || null,
      remarks: remarks || null,
      createdBy: createdBy || null,
    },
  });
}
