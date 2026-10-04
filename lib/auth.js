import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import prisma from './prisma.js';
import { readCache, invalidateReadCache } from './read-cache.js';
import { unauthorized, forbidden } from './api-response.js';
import { SESSION_TTL } from './session.js';
import { getJwtSecret } from './jwt-secret.js';
import { isActiveAccount } from './security.js';
import { isLuitAdmin, publicRole, TENDER_ROLE } from './roles.js';
import { sameSession, storedLuitAdminSession } from './luit-admin/single-session.js';

/**
 * Standard Employee Roles
 * A = Admin
 * M = Manager
 * E = Employee
 */
export const ROLES = {
  ADMIN: 'A',
  MANAGER: 'M',
  EMPLOYEE: 'E',
  ACCOUNTANT: 'AA',
};

/**
 * Hash a plain text password
 */
export async function hashPassword(password) {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
}

/**
 * Compare plain password against bcrypt hash
 */
export async function comparePassword(password, hash) {
  if (!password || !hash) return false;
  return bcrypt.compare(password, hash);
}

/**
 * Sign a JWT token
 */
export function signToken(payload, expiresIn = SESSION_TTL) {
  const secret = getJwtSecret();
  if (!secret) {
    throw new Error('JWT_SECRET is not configured.');
  }
  return jwt.sign(payload, secret, { expiresIn, algorithm: 'HS256' });
}

/**
 * Verify a JWT token
 */
export function verifyToken(token) {
  try {
    const secret = getJwtSecret();
    if (!secret) return null;
    return jwt.verify(token, secret, { algorithms: ['HS256'] });
  } catch (error) {
    return null;
  }
}

/**
 * Sanitize an employee record so passwordHash is NEVER exposed
 */
export function sanitizeEmployee(employee) {
  if (!employee) return null;
  const { passwordHash, ...safeEmployee } = employee;
  return safeEmployee;
}

/**
 * Extract token from Request Authorization header or cookies
 */
export function getAuthToken(request) {
  const authHeader =
    request.headers.get('authorization') || request.headers.get('Authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7).trim();
  }

  // Fallback to cookie for Admin Web Panel
  const cookieHeader = request.headers.get('cookie');
  if (cookieHeader) {
    for (const part of cookieHeader.split(';')) {
      const [rawKey, ...rest] = part.trim().split('=');
      if (rawKey !== 'auth_token') continue;
      const rawValue = rest.join('=');
      // A malformed percent-escape must not turn into a 500.
      try {
        return decodeURIComponent(rawValue) || null;
      } catch {
        return rawValue || null;
      }
    }
  }

  return null;
}

const SESSION_TTL_MS = 20_000;

/** Fingerprint of the password hash so a password change rejects older tokens. */
export function credentialTag(passwordHash) {
  if (!passwordHash) return '';
  return crypto.createHash('sha256').update(String(passwordHash)).digest('hex').slice(0, 16);
}

export function invalidateSession(userId) {
  if (userId) invalidateReadCache(`session:${userId}`);
}

async function loadSession(userId) {
  return readCache(`session:${userId}`, SESSION_TTL_MS, async () => {
    const employee = await prisma.employee.findUnique({
      where: { id: userId },
      include: {
        department: true,
        designation: true,
        firm: { select: { id: true, name: true } },
      },
    });
    if (!employee) return null;
    const user = sanitizeEmployee(employee);
    user.accountRole = employee.role;
    user.role = publicRole(employee.role);
    return {
      active: isActiveAccount(employee),
      user,
      cv: credentialTag(employee.passwordHash),
      // The Luit admin has one live session; see luit-admin/single-session.js.
      luitSession: isLuitAdmin(employee.role) ? await storedLuitAdminSession(prisma, employee.id) : null,
    };
  });
}

async function sessionFromRequest(request) {
  const token = getAuthToken(request);
  if (!token) return { status: 'missing' };

  const decoded = verifyToken(token);
  if (!decoded || !decoded.id) return { status: 'invalid' };

  const session = await loadSession(decoded.id);
  if (!session) return { status: 'missing-user' };
  if (!session.active) return { status: 'inactive' };
  if (decoded.cv && decoded.cv !== session.cv) return { status: 'revoked' };
  if (isLuitAdmin(session.user.accountRole) && !sameSession(decoded.ls, session.luitSession)) return { status: 'revoked' };
  return { status: 'ok', user: session.user };
}

/**
 * Get authenticated employee from incoming request
 */
export async function getAuthenticatedUser(request) {
  const session = await sessionFromRequest(request);
  return session.status === 'ok' ? session.user : null;
}

/**
 * Route Handler Middleware to require authentication
 */
/**
 * A refused session also drops its cookies. The middleware only checks the
 * token's signature, so a cookie left behind would keep sending the browser
 * away from /login while every API call answers 401.
 */
function endedSession(message) {
  const response = unauthorized(message);
  const cleared = { secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 0 };
  response.cookies?.set('auth_token', '', { ...cleared, httpOnly: true });
  response.cookies?.set('auth_role', '', { ...cleared, httpOnly: false });
  return response;
}

export function requireAuth(handler) {
  return async (request, context = {}) => {
    const session = await sessionFromRequest(request);
    if (session.status === 'missing') {
      return unauthorized('Authentication required. Missing Bearer token.');
    }
    if (session.status === 'invalid' || session.status === 'revoked') {
      return endedSession('Your session ended. Sign in again.');
    }
    if (session.status === 'missing-user') {
      return endedSession('User account not found.');
    }
    if (session.status === 'inactive') {
      return endedSession('This account is deactivated. Contact an administrator.');
    }
    return handler(request, { ...context, user: session.user });
  };
}

/**
 * Route Handler Middleware to require specific role(s)
 * @param {string[]} allowedRoles - Array of roles e.g. ['A', 'M']
 */
export function requireRoles(allowedRoles = []) {
  return (handler) => {
    return requireAuth(async (request, context = {}) => {
      const { user } = context;

      if (!isLuitAdmin(user.accountRole) && allowedRoles.length > 0 && (!user.role || !allowedRoles.includes(user.role))) {
        return forbidden(
          `Access denied. Requires one of roles: [${allowedRoles.join(', ')}]. Current role: ${user.role || 'none'}`
        );
      }

      return handler(request, context);
    });
  };
}

/**
 * Check if a user has any of the specified roles
 */
export function hasRole(user, ...roles) {
  if (!user || !user.role) return false;
  return roles.includes(user.role);
}

/**
 * Filter allowed employee update fields according to role permissions
 * @param {string} requesterRole - Role of the updating user ('A', 'M', 'E')
 * @param {Object} body - Incoming payload
 * @returns {{ allowedData: Object, error?: string }}
 */
export function filterAllowedEmployeeUpdates(requesterRole, body) {
  // If Employee: can ONLY update personal profile fields
  if (requesterRole === ROLES.EMPLOYEE || requesterRole === TENDER_ROLE) {
    // Prohibited administrative fields
    const prohibitedFields = [
      'role',
      'status',
      'deptId',
      'designationId',
      'siteId',
      'employeeCode',
      'joinDate',
      'email',
      'password',
      'passwordHash',
    ];
    for (const field of prohibitedFields) {
      if (body[field] !== undefined) {
        return {
          error: `Employees are not permitted to modify administrative field: "${field}".`,
        };
      }
    }

    // Permitted fields for self-service employee profile updates
    const permittedFields = [
      'name',
      'phone',
      'dob',
      'gender',
      'address',
      'profileImageUrl',
      'bankDetails',
      'pan',
      'aadhar',
      'uan',
      'emergencyNo',
    ];

    const allowedData = {};
    for (const key of permittedFields) {
      if (body[key] !== undefined) {
        allowedData[key] = body[key];
      }
    }

    return { allowedData };
  }

  // If Manager: cannot promote anyone to Admin ('A')
  if (requesterRole === ROLES.MANAGER) {
    const nextRole = String(body.role || '').trim().toUpperCase();
    if (nextRole === ROLES.ADMIN || nextRole === ROLES.ACCOUNTANT) {
      return {
        error: 'Managers cannot grant Administrator or Accountant permissions.',
      };
    }
  }

  // Admins have full access; Managers have full field access except role='A'
  const { ...allowedData } = body;
  delete allowedData.id;
  delete allowedData.createdAt;
  delete allowedData.updatedAt;

  return { allowedData };
}

