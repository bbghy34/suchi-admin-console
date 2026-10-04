import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, comparePassword, hashPassword, invalidateSession } from '@/lib/auth';
import { badRequest, handleApiError } from '@/lib/api-response';
import { rateLimit } from '@/lib/rate-limit';
import { passwordProblem } from '@/lib/password-policy.mjs';

const NO_STORE = { 'Cache-Control': 'private, no-store' };
// Five wrong guesses per quarter hour, so a borrowed session cannot test
// passwords against this endpoint.
const ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;

function refuse(message, status, field) {
  return NextResponse.json({ success: false, message, ...(field ? { field } : {}) }, { status, headers: NO_STORE });
}

/**
 * POST /api/auth/change-password
 * Allows authenticated users to change their own password.
 * Requires: currentPassword, newPassword, confirmPassword
 * A changed password signs the account out on every device: tokens carry a
 * fingerprint of the password hash, and this response clears the cookies.
 */
export const POST = requireAuth(async (request, { user }) => {
  try {
    const body = await request.json().catch(() => null);

    if (!body) {
      return badRequest('Request body is required.');
    }

    const { currentPassword, newPassword, confirmPassword } = body;

    if (!currentPassword || !newPassword || !confirmPassword) {
      return badRequest('All password fields are required.');
    }

    const problem = passwordProblem(newPassword);
    if (problem) return refuse(problem, 400, 'newPassword');

    if (newPassword !== confirmPassword) {
      return refuse('New password and confirmation do not match.', 400, 'confirmPassword');
    }

    if (currentPassword === newPassword) {
      return refuse('New password must be different from your current password.', 400, 'newPassword');
    }

    const limit = rateLimit(`change-password:${user.id}`, ATTEMPTS, WINDOW_MS);
    if (!limit.ok) {
      return NextResponse.json(
        { success: false, message: `Too many attempts. Try again in ${Math.ceil(limit.retryAfter / 60)} minutes.` },
        { status: 429, headers: { ...NO_STORE, 'Retry-After': String(limit.retryAfter) } }
      );
    }

    // Fetch current passwordHash from DB
    const employee = await prisma.employee.findUnique({
      where: { id: user.id },
      select: { passwordHash: true },
    });

    if (!employee || !employee.passwordHash) {
      return refuse('Account not found or password not set.', 404);
    }

    // Verify current password. 400, not 401: the session is still valid.
    const isCurrentValid = await comparePassword(String(currentPassword), employee.passwordHash);
    if (!isCurrentValid) {
      return refuse('Current password is incorrect.', 400, 'currentPassword');
    }

    // Hash and save new password
    const newHash = await hashPassword(newPassword);
    await prisma.employee.update({
      where: { id: user.id },
      data: { passwordHash: newHash },
    });
    invalidateSession(user.id);

    const response = NextResponse.json(
      { success: true, message: 'Password changed. Sign in again.' },
      { status: 200, headers: NO_STORE }
    );
    const cleared = { secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 0 };
    response.cookies.set('auth_token', '', { ...cleared, httpOnly: true });
    response.cookies.set('auth_role', '', { ...cleared, httpOnly: false });
    return response;
  } catch (error) {
    return handleApiError(error, 'Failed to change password.');
  }
});
