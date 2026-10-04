import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { comparePassword, signToken, sanitizeEmployee, credentialTag, invalidateSession } from '@/lib/auth';
import { canUseTenderDesk, canViewBills, isLuitAdmin, publicRole } from '@/lib/roles';
import { startLuitAdminSession } from '@/lib/luit-admin/single-session';
import { badRequest, unauthorized, serverError, handleApiError, bigintSafeSerialize } from '@/lib/api-response';
import { isActiveAccount } from '@/lib/security';
import { rateLimit, clientAddress } from '@/lib/rate-limit';
import { SESSION_TTL_SECONDS } from '@/lib/session';

const DUMMY_PASSWORD_HASH = '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';

export async function POST(request) {
  try {
    const body = await request.json().catch(() => null);

    if (!body || !body.email || !body.password) {
      return badRequest('Email and password are required.');
    }

    const { email, password } = body;
    const normalizedEmail = String(email).trim().toLowerCase();

    const limit = rateLimit(`login:${clientAddress(request)}:${normalizedEmail}`, 8, 15 * 60 * 1000);
    if (!limit.ok) {
      return NextResponse.json(
        { success: false, message: 'Too many login attempts. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(limit.retryAfter), 'Cache-Control': 'private, no-store' } }
      );
    }

    // Find employee by email (case-insensitive search)
    const matches = await prisma.employee.findMany({
      where: {
        email: {
          equals: normalizedEmail,
          mode: 'insensitive',
        },
      },
      include: {
        department: true,
        designation: true,
        firm: { select: { id: true, name: true } },
      },
      take: 2,
    });

    if (matches.length > 1) {
      return unauthorized('Multiple accounts use this email. Contact an administrator.');
    }

    const employee = matches[0] || null;

    const passwordHash = employee?.passwordHash || DUMMY_PASSWORD_HASH;
    const isPasswordValid = await comparePassword(password, passwordHash);
    if (!employee || !employee.passwordHash || !isPasswordValid) {
      return unauthorized('Invalid email or password.');
    }

    if (!isActiveAccount(employee)) {
      return unauthorized('This account is deactivated. Contact an administrator.');
    }

    // A Luit admin sign-in ends every earlier Luit admin session.
    const luitSession = isLuitAdmin(employee.role) ? await startLuitAdminSession(prisma, employee.id) : null;
    if (luitSession) invalidateSession(employee.id);

    let token;
    try {
      token = signToken({
        id: employee.id,
        email: employee.email,
        role: publicRole(employee.role),
        name: employee.name,
        bills: canViewBills(employee.role),
        tenderDesk: canUseTenderDesk(employee.role),
        cv: credentialTag(employee.passwordHash),
        ...(luitSession ? { ls: luitSession } : {}),
      });
    } catch {
      return serverError('Authentication is temporarily unavailable.');
    }

    // Sanitize employee record - NEVER return passwordHash
    const safeEmployee = bigintSafeSerialize(sanitizeEmployee(employee));
    safeEmployee.role = publicRole(employee.role);
    safeEmployee.canViewBills = canViewBills(employee.role);
    safeEmployee.canUseTenderDesk = canUseTenderDesk(employee.role);

    const response = NextResponse.json(
      {
        success: true,
        message: 'Authentication successful',
        token,
        employee: safeEmployee,
        data: {
          token,
          employee: safeEmployee,
          user: safeEmployee,
        },
      },
      { status: 200, headers: { 'Cache-Control': 'private, no-store' } }
    );

    // Set HTTP-only cookie for Admin Web Panel convenience
    const cookieOptions = {
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_TTL_SECONDS,
    };

    response.cookies.set('auth_token', token, {
      ...cookieOptions,
      httpOnly: true,
    });

    if (safeEmployee.role === 'A' || safeEmployee.role === 'M' || safeEmployee.role === 'E' || safeEmployee.role === 'AA' || safeEmployee.role === 'T') {
      response.cookies.set('auth_role', safeEmployee.role, {
        ...cookieOptions,
        httpOnly: false,
      });
    }

    return response;
  } catch (error) {
    return handleApiError(error, 'Internal server error during authentication.');
  }
}
