import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getAuthToken, invalidateSession, verifyToken } from '@/lib/auth';
import { endLuitAdminSession } from '@/lib/luit-admin/single-session';

export async function POST(request) {
  const decoded = verifyToken(getAuthToken(request) || '');
  if (decoded?.ls) {
    await endLuitAdminSession(prisma, decoded.id, decoded.ls).catch(() => {});
    invalidateSession(decoded.id);
  }
  const response = NextResponse.json(
    {
      success: true,
      message: 'Logged out successfully.',
    },
    { status: 200, headers: { 'Cache-Control': 'private, no-store' } }
  );

  // Clear auth_token cookie
  const cleared = {
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  };
  response.cookies.set('auth_token', '', { ...cleared, httpOnly: true });
  response.cookies.set('auth_role', '', { ...cleared, httpOnly: false });

  return response;
}
