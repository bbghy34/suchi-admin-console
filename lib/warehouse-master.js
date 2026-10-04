import prisma from './prisma.js';
import { requireRoles } from './auth.js';
import { successResponse, errorResponse, handleApiError } from './api-response.js';
import { onlyActive, setActiveHandler } from './visibility.js';
import { StockError } from './warehouse.js';
import { invalidateWarehouseOptions, invalidateLowStock } from './read-cache.js';

function readField(body, field) {
  const raw = body?.[field.key];
  if (field.type === 'number') {
    if (raw === '' || raw === undefined || raw === null) {
      if (field.default !== undefined) return field.default;
      return field.required ? undefined : null;
    }
    const num = Number(raw);
    return num;
  }
  const text = String(raw ?? '').trim();
  if (!text) return field.required ? '' : null;
  return text;
}

function readData(body, fields) {
  const data = {};
  for (const field of fields) {
    data[field.key] = readField(body, field);
  }
  return data;
}

function validateData(data, fields) {
  for (const field of fields) {
    const value = data[field.key];
    const label = field.label || field.key;
    if (field.type === 'number') {
      if (!Number.isFinite(value)) return `${label} must be a number.`;
      if (field.required && value === undefined) return `${label} is required.`;
      continue;
    }
    if (field.required && !value) return `${label} is required.`;
  }
  return '';
}

function fail(error, fallback) {
  if (error instanceof StockError) return errorResponse(error.message, 400);
  if (error?.code === 'P2002') return errorResponse('That value is already in use.', 409);
  if (error?.code === 'P2003') return errorResponse('A related record was not found.', 400);
  return handleApiError(error, fallback);
}

export function masterCollection({ delegateName, label, fields, include, orderBy = { name: 'asc' }, prepare }) {
  const GET = requireRoles(['A', 'M'])(async (request, { user }) => {
    try {
      const { searchParams } = new URL(request.url);
      const rows = await prisma[delegateName].findMany({
        where: onlyActive({}, searchParams, user),
        orderBy,
        ...(include ? { include } : {}),
      });
      return successResponse(rows, `${label} list retrieved.`);
    } catch (error) {
      return fail(error, `Failed to retrieve ${label}.`);
    }
  });

  const POST = requireRoles(['A', 'M'])(async (request, { user }) => {
    try {
      const body = await request.json().catch(() => null);
      if (!body || typeof body !== 'object') return errorResponse('JSON body is required.', 400);
      let data = readData(body, fields);
      const message = validateData(data, fields);
      if (message) return errorResponse(message, 400);
      if (prepare) data = await prepare(data, { user });
      const created = await prisma[delegateName].create({
        data,
        ...(include ? { include } : {}),
      });
      invalidateWarehouseOptions();
      invalidateLowStock();
      return successResponse(created, `${label} created.`, 201);
    } catch (error) {
      return fail(error, `Failed to create ${label}.`);
    }
  });

  return { GET, POST };
}

export function masterItem({ delegateName, label, fields, include, prepare }) {
  const PUT = requireRoles(['A', 'M'])(async (request, { user, params }) => {
    try {
      const { id } = await params;
      const existing = await prisma[delegateName].findUnique({ where: { id } });
      if (!existing) return errorResponse(`${label} not found.`, 404);
      const body = await request.json().catch(() => null);
      if (!body || typeof body !== 'object') return errorResponse('JSON body is required.', 400);
      let data = readData(body, fields);
      const message = validateData(data, fields);
      if (message) return errorResponse(message, 400);
      if (prepare) data = await prepare(data, { user, existing });
      const updated = await prisma[delegateName].update({
        where: { id },
        data,
        ...(include ? { include } : {}),
      });
      invalidateWarehouseOptions();
      invalidateLowStock();
      return successResponse(updated, `${label} updated.`);
    } catch (error) {
      return fail(error, `Failed to update ${label}.`);
    }
  });

  const active = setActiveHandler(prisma[delegateName], label);
  return { PUT, PATCH: active, DELETE: active };
}
