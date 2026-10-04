import { NextResponse } from 'next/server';
import { getJwtSecret } from './lib/jwt-secret.js';
import { LUIT_ADMIN_ROLE } from './lib/luit-admin/account.mjs';

function base64UrlToBytes(input) {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(input.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Verify HS256 signatures in the Edge runtime. Payload decoding alone is not authentication.
 */
async function verifyJwtPayload(token) {
  try {
    const secret = getJwtSecret();
    if (!secret) return null;

    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [headerPart, payloadPart, signaturePart] = parts;
    const header = JSON.parse(new TextDecoder().decode(base64UrlToBytes(headerPart)));
    if (header.alg !== 'HS256') return null;

    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );

    const valid = await crypto.subtle.verify(
      'HMAC',
      key,
      base64UrlToBytes(signaturePart),
      new TextEncoder().encode(`${headerPart}.${payloadPart}`)
    );
    if (!valid) return null;

    const decoded = JSON.parse(new TextDecoder().decode(base64UrlToBytes(payloadPart)));
    if (decoded.exp && decoded.exp * 1000 < Date.now()) return null;
    return decoded;
  } catch {
    return null;
  }
}

const ROLE_PERMISSIONS = {
  A: null,
  [LUIT_ADMIN_ROLE]: null,
  M: {
    restrictedPrefixes: ['/departments', '/designations', '/boatbrothers', '/bills', '/parties'],
  },
  AA: {
    restrictedPrefixes: [
      '/projects',
      '/contractors',
      '/sites',
      '/boqs',
      '/departments',
      '/designations',
      '/reports',
      '/employees',
      '/tenders',
      '/boatbrothers',
      '/firms',
      '/progress',
      '/site-expenses',
      '/warehouse',
      '/attendance',
      '/leaves',
    ],
  },
  E: {
    restrictedPrefixes: [
      '/projects',
      '/contractors',
      '/sites',
      '/boqs',
      '/departments',
      '/designations',
      '/reports',
      '/employees',
      '/tenders',
      '/boatbrothers',
      '/firms',
      '/progress',
      '/site-expenses',
      '/bills',
      '/parties',
      '/warehouse',
    ],
  },
};

const STATIC_FILE = /\.(?:png|jpe?g|gif|webp|svg|ico|css|js|map|txt|woff2?|ttf|eot|json)$/i;

function applyCors(request, response) {
  const origin = request.headers.get('origin');
  const allowlist = (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  if (origin && allowlist.includes(origin)) {
    response.headers.set('Access-Control-Allow-Origin', origin);
    response.headers.set('Access-Control-Allow-Credentials', 'true');
    response.headers.set('Vary', 'Origin');
    response.headers.set('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type, Accept');
  }

  return response;
}

export async function middleware(request) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith('/api/')) {
    if (request.method === 'OPTIONS') {
      return applyCors(request, new NextResponse(null, { status: 204 }));
    }
    return applyCors(request, NextResponse.next());
  }

  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/static') ||
    pathname === '/favicon.ico' ||
    STATIC_FILE.test(pathname)
  ) {
    return NextResponse.next();
  }

  if (pathname === '/' || pathname === '/login') {
    const token = request.cookies.get('auth_token')?.value;
    if (token && pathname === '/login') {
      const decoded = await verifyJwtPayload(token);
      if (decoded && decoded.id) {
        return NextResponse.redirect(new URL('/dashboard', request.url));
      }
    }
    return NextResponse.next();
  }

  const token = request.cookies.get('auth_token')?.value;
  if (!token) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  const decoded = await verifyJwtPayload(token);
  if (!decoded || !decoded.id || !decoded.role) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    const response = NextResponse.redirect(loginUrl);
    response.cookies.delete('auth_token');
    return response;
  }

  const billsPage = pathname === '/bills' || pathname.startsWith('/bills/');
  const billPath = billsPage || pathname === '/parties' || pathname.startsWith('/parties/');
  const adminOnBills = billsPage && decoded.role === 'A';
  if (billPath && !adminOnBills && decoded.role !== 'AA' && decoded.role !== LUIT_ADMIN_ROLE && decoded.bills !== true) {
    const unauthorizedUrl = new URL('/dashboard', request.url);
    unauthorizedUrl.searchParams.set('unauthorized', 'true');
    return NextResponse.redirect(unauthorizedUrl);
  }

  const tenderDeskPath = pathname === '/tenders'
    || pathname === '/tenders/desk'
    || pathname.startsWith('/tenders/desk/')
    || pathname === '/boatbrothers/upload'
    || pathname.startsWith('/boatbrothers/upload/');
  if (tenderDeskPath && decoded.tenderDesk !== true && decoded.role !== 'T') {
    const unauthorizedUrl = new URL('/dashboard', request.url);
    unauthorizedUrl.searchParams.set('unauthorized', 'true');
    return NextResponse.redirect(unauthorizedUrl);
  }

  if (decoded.role === 'T') {
    const allowed = ['/tenders/daily', '/profile', '/dashboard/settings'];
    const permitted = allowed.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
    if (!permitted) {
      return NextResponse.redirect(new URL('/tenders/daily', request.url));
    }
    return NextResponse.next();
  }

  const permissionConfig = ROLE_PERMISSIONS[decoded.role];

  if (permissionConfig && permissionConfig.restrictedPrefixes) {
    const isRestricted = permissionConfig.restrictedPrefixes.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
    );

    if (isRestricted) {
      const unauthorizedUrl = new URL('/dashboard', request.url);
      unauthorizedUrl.searchParams.set('unauthorized', 'true');
      return NextResponse.redirect(unauthorizedUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
