import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { requirePerson } from '@/lib/desk/auth';
import { handler, ok } from '@/lib/desk/api';
import { tick } from '@/lib/desk/scheduler';

export const POST = handler(async () => {
  await requirePerson();
  await tick(new Date(), { force: true });
  return ok({});
});

/** Vercel sends this secret as a bearer token. No cookie session is required. */
export async function GET(req) {
  const secret = process.env.CRON_SECRET;
  const supplied = req.headers.get('authorization') || '';
  const expected = `Bearer ${secret || ''}`;
  const suppliedBytes = Buffer.from(supplied);
  const expectedBytes = Buffer.from(expected);
  if (!secret || suppliedBytes.length !== expectedBytes.length || !timingSafeEqual(suppliedBytes, expectedBytes)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }
  await tick(new Date(), { force: true, throwOnError: true });
  return NextResponse.json({ ok: true });
}
export const maxDuration = 60;
