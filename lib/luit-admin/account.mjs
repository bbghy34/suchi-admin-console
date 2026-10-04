/**
 * The Luit admin: the Boat Brothers platform account that runs and supports a
 * client's workspace. Today it is an Employee row whose stored role is 'SX';
 * this file is the only place that knows that value. When the Luit admin
 * moves to its own table, change these two functions and the queries below.
 */
export const LUIT_ADMIN_ROLE = 'SX';

export function isLuitAdmin(role) {
  return role === LUIT_ADMIN_ROLE;
}

/**
 * These lookups run before almost every API response, and the answer only
 * changes when someone's role changes. Keeping it for 30 seconds removes a
 * database round trip from each request. Cached per database client.
 */
export const LOOKUP_TTL_MS = 30_000;
const lookups = new WeakMap();
export function cachedLookup(db, key, loader, now = Date.now()) {
  if (!db || (typeof db !== 'object' && typeof db !== 'function')) return loader();
  let entries = lookups.get(db);
  if (!entries) lookups.set(db, (entries = new Map()));
  const hit = entries.get(key);
  if (hit && hit.expires > now) return hit.value;
  const value = Promise.resolve().then(loader);
  entries.set(key, { value, expires: now + LOOKUP_TTL_MS });
  value.catch(() => entries.delete(key));
  return value;
}

/** Forget the cached lookups, for example right after an account's role changes. */
export function forgetLuitAdminLookups(db) {
  lookups.delete(db);
}

/** Employee ids of Luit admin accounts. Internal lookups only; never returned to a client screen. */
export function luitAdminEmployeeIds(db) {
  return cachedLookup(db, 'employees', async () => {
    const rows = await db.$queryRaw`SELECT id FROM "Employee" WHERE UPPER(TRIM(role)) = ${LUIT_ADMIN_ROLE}`;
    return new Set(rows.map((row) => row.id));
  });
}

/** Tender Desk person ids that belong to a Luit admin account. */
export function luitAdminPersonIds(db) {
  return cachedLookup(db, 'people', async () => {
    const rows = await db.$queryRaw`SELECT p.id FROM "DeskPerson" p JOIN "Employee" e ON e.id=p."employeeId" WHERE UPPER(TRIM(e.role)) = ${LUIT_ADMIN_ROLE}`;
    return new Set(rows.map((row) => row.id));
  });
}
