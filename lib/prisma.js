import { PrismaClient } from '@prisma/client';
import { LUIT_ADMIN_ROLE, TENDER_ROLE } from './roles.js';

const globalForPrisma = globalThis;
const CLIENT_MARK = 'tender-status-1';
const EXCLUDED_STAFF_ROLES = [LUIT_ADMIN_ROLE, TENDER_ROLE];

function mergeWhere(where, extra) {
  if (!where || Object.keys(where).length === 0) return extra;
  return { AND: [where, extra] };
}

/** Login and a direct id read must still find the account. Lists and counts must not. */
function isDirectIdentityLookup(where) {
  if (!where || typeof where !== 'object') return false;
  if (where.email) return true;
  if (typeof where.id === 'string') return true;
  return false;
}

function omitHiddenStaff(where) {
  return mergeWhere(where, {
    OR: [
      { role: null },
      { role: { notIn: EXCLUDED_STAFF_ROLES } },
    ],
  });
}

function omitHiddenAccount(where) {
  return mergeWhere(where, {
    OR: [
      { employee: { is: { role: null } } },
      { employee: { is: { role: { notIn: EXCLUDED_STAFF_ROLES } } } },
    ],
  });
}

function datasourceUrl() {
  const raw = process.env.DATABASE_URL || '';
  if (!raw || raw.includes('statement_cache_size=')) return raw;
  const join = raw.includes('?') ? '&' : '?';
  const pooler = raw.includes('-pooler') && !raw.includes('pgbouncer=') ? '&pgbouncer=true' : '';
  return `${raw}${join}statement_cache_size=0${pooler}`;
}

function createClient() {
  const base = new PrismaClient({
    datasourceUrl: datasourceUrl(),
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });
  return base.$extends({
    query: {
      employee: {
        async findMany({ args, query }) {
          if (!isDirectIdentityLookup(args.where)) args.where = omitHiddenStaff(args.where);
          return query(args);
        },
        async count({ args, query }) {
          if (!isDirectIdentityLookup(args.where)) args.where = omitHiddenStaff(args.where);
          return query(args);
        },
      },
      attendance: {
        async findMany({ args, query }) {
          args.where = omitHiddenAccount(args.where);
          return query(args);
        },
        async count({ args, query }) {
          args.where = omitHiddenAccount(args.where);
          return query(args);
        },
      },
      leave: {
        async findMany({ args, query }) {
          args.where = omitHiddenAccount(args.where);
          return query(args);
        },
        async count({ args, query }) {
          args.where = omitHiddenAccount(args.where);
          return query(args);
        },
      },
    },
  });
}

export const prisma =
  globalForPrisma.prismaMark === CLIENT_MARK
    ? globalForPrisma.prisma
    : createClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
  globalForPrisma.prismaMark = CLIENT_MARK;
}

export default prisma;
