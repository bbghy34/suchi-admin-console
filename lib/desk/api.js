import { prisma } from '@/lib/prisma';
import { redactActorFields } from '@/lib/luit-admin/privacy.mjs';
import { luitAdminPersonIds } from '@/lib/luit-admin/privacy.mjs';
import { NextResponse, after } from 'next/server';
import { HttpError, requirePerson } from './auth';
import { tick } from './scheduler';

export async function ok(data = {}, init = {}) {
  const visible = redactActorFields(data, await luitAdminPersonIds(prisma));
  return NextResponse.json({ ok: true, ...visible }, init);
}

export function fail(status, message, extra = {}) {
  return NextResponse.json({ ok: false, error: message, ...extra }, { status });
}

/** Wrap a route handler: run the scheduler tick, map errors to JSON. */
export function handler(fn) {
  return async (req, ctx) => {
    try {
      await requirePerson();
      after(() => tick());
      const params = ctx?.params ? await ctx.params : {};
      return await fn(req, { ...ctx, params });
    } catch (err) {
      if (err instanceof HttpError) return fail(err.status, err.message, err.extra || {});
      if (err?.code === 'P2002') return fail(409, 'That record already exists.', { code: err.code });
      if (err?.code === 'P2025' || err?.code === 'P2034') return fail(409, 'This record changed. Refresh and try again.');
      console.error(err);
      return fail(500, 'Something went wrong. Please try again.');
    }
  };
}

/** Read a JSON or multipart body into a plain object plus file list. */
export async function readBody(req) {
  const type = req.headers.get('content-type') || '';
  if (type.includes('multipart/form-data') || type.includes('application/x-www-form-urlencoded')) {
    const form = await req.formData();
    const fields = {};
    const files = [];
    for (const [key, value] of form.entries()) {
      if (typeof value === 'object' && value && typeof value.arrayBuffer === 'function') {
        if (value.size > 0) files.push({ field: key, file: value });
      } else if (fields[key] !== undefined) {
        fields[key] = [].concat(fields[key], value);
      } else {
        fields[key] = value;
      }
    }
    return { fields, files };
  }
  if (type.includes('application/json')) {
    const json = await req.json().catch(() => { throw new HttpError(400, 'Send a valid JSON object.'); });
    if (!json || typeof json !== 'object' || Array.isArray(json)) throw new HttpError(400, 'Send a valid JSON object.');
    return { fields: json || {}, files: [] };
  }
  return { fields: {}, files: [] };
}

export function str(v) {
  if (v == null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

export function num(v) {
  if (v == null || v === '') return null;
  const n = Number(String(v).replace(/[₹,\s]/g, ''));
  if (!Number.isFinite(n)) throw new HttpError(400, 'Enter a finite numeric amount.');
  return n;
}

export function bool(v) {
  return v === true || v === 'true' || v === '1' || v === 'on' || v === 'yes';
}
