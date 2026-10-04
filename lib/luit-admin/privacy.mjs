/**
 * Keeps the Luit admin (see account.mjs) out of the client's screens: staff
 * lists, pickers, counts, "created by" fields, and Tender Desk activity.
 * Presentation only: stored records and audit history stay intact, and
 * sign-in still reads the real account.
 */
import { cachedLookup, isLuitAdmin, LUIT_ADMIN_ROLE, luitAdminEmployeeIds, luitAdminPersonIds } from './account.mjs';

export { luitAdminPersonIds };

// ── Response masking ─────────────────────────────────────────────────────
/** Output-only actor masking. Never use this helper for authentication or writes. */
const ID_FIELDS = new Set(['createdBy','updatedBy','approvedBy','requestedBy','reviewedBy','deletedBy','issuedBy','receivedBy','uploadedBy','actorId','createdById','updatedById','approvedById','requestedById','reviewedById','uploadedById','employeeId','managerId','hodId','hod','HOD','personId','addedById','sitManager']);
const RELATIONS = new Map([
  ['creator','createdBy'],['editor','updatedBy'],['approver','approvedBy'],['requester','requestedBy'],
  ['createdByEmployee','createdBy'],['updatedByEmployee','updatedBy'],['approvedByEmployee','approvedBy'],
  ['employee','employeeId'],['manager','managerId'],['hodEmployee','hod'],['actor','actorId'],
  ['person','personId'],['uploadedBy','uploadedById'],['addedBy','addedById'],['uploadedByPerson','uploadedById'],['createdByPerson','createdById'],['updatedByPerson','updatedById'],
]);
const NAME_FIELDS = new Map([['createdByName','createdBy'],['updatedByName','updatedBy'],['approvedByName','approvedBy'],['requestedByName','requestedBy'],['employeeName','employeeId'],['managerName','managerId'],['hodName','hod']]);
// Structured document evidence and business JSON are not account directories.
const OPAQUE_FIELDS = new Set(['metadata','evidence','fields','bankDetails','address','config','rawPayload','documentData']);

/**
 * Accept account rows {id,name,uniqueName} or an exact ID Set. A name is evidence
 * only when uniqueness was verified; coincidentally equal business names survive.
 * Strings in descriptions/remarks/document text are never searched or replaced.
 */
export function redactActorFields(data, hiddenAccounts, { names = [] } = {}) {
  const rows = hiddenAccounts instanceof Set ? [...hiddenAccounts].map(id=>({id})) : (hiddenAccounts || []);
  const ids = new Set(rows.map(r=>r.id));
  const exactNames = new Set([...names, ...rows.filter(r=>r.uniqueName && r.name).map(r=>r.name)]);
  const isHidden = value => typeof value === 'string' && (ids.has(value) || exactNames.has(value));
  const seen = new WeakMap();
  function visit(value) {
    if (!value || typeof value !== 'object' || value instanceof Date || value instanceof Uint8Array || value instanceof ArrayBuffer) return value;
    if (seen.has(value)) return seen.get(value);
    if (Array.isArray(value)) { const array=[];seen.set(value,array);for(const item of value)array.push(visit(item));return array; }
    // Prisma Decimal and other value types keep their existing JSON representation.
    if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) return value;
    const out={};seen.set(value,out);
    for(const [key,child] of Object.entries(value)) {
      const sibling = RELATIONS.get(key) || NAME_FIELDS.get(key);
      const actorObject = RELATIONS.has(key) && child && typeof child==='object' && (ids.has(child.id) || ids.has(child.employeeId));
      if ((ID_FIELDS.has(key) && isHidden(child)) || actorObject || (sibling && isHidden(value[sibling])) || (NAME_FIELDS.has(key) && isHidden(child))) out[key]=null;
      else if (['itemReceivedImage','images'].includes(key) && typeof child === 'string' && /^[\s]*[\[{]/.test(child)) {
        // Legacy delivery/progress image arrays can be JSON encoded in a string.
        // Preserve the response type; never parse arbitrary descriptions or documents.
        try { const parsed=JSON.parse(child); out[key]=parsed && typeof parsed==='object' ? JSON.stringify(visit(parsed)) : child; }
        catch { out[key]=child; }
      } else out[key]=OPAQUE_FIELDS.has(key)?child:visit(child);
    }
    return out;
  }
  return visit(data);
}

/** Server-only lookup: no cache, so role changes take effect on the next response. */
export async function redactLuitAdmin(db, data) {
  if (typeof window !== 'undefined') throw new Error('Account visibility serialization is server-only.');
  // Employee.findMany leaves the Luit admin out globally. This internal parameterized
  // query retrieves minimal evidence; those rows are never returned to clients.
  // Cached for 30 seconds (see account.mjs): this runs before most API responses.
  const accounts = await cachedLookup(db, 'accounts', () => db.$queryRaw`
    SELECT e.id, e.name,
      NOT EXISTS (SELECT 1 FROM "Employee" other WHERE other.id <> e.id
        AND LOWER(TRIM(other.name)) = LOWER(TRIM(e.name))) AS "uniqueName"
    FROM "Employee" e WHERE UPPER(e.role) = ${LUIT_ADMIN_ROLE}
  `);
  return redactActorFields(data,accounts);
}

/** Explicitly used only by selected business routes, never by auth responses. */
export async function hideLuitAdminResponse(db, response, data, ...args) {
  return response(await redactLuitAdmin(db,data),...args);
}

// ── Workforce screens ────────────────────────────────────────────────────
/** Workforce filters are explicit: authentication continues to read the account. */
export function workforceEmployeeWhere(where = {}) {
  return { ...where, AND: [...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []), { OR: [{ role: null }, { role: { not: LUIT_ADMIN_ROLE } }] }] };
}

export function workforceRecordWhere() {
  return { NOT: { employee: { is: { role: LUIT_ADMIN_ROLE } } } };
}

export function workforceRecordDelegate(delegate) {
  return {
    findUnique: args => delegate.findUnique({ ...args, where: { ...args.where, ...workforceRecordWhere() } }),
    update: args => delegate.update({ ...args, where: { ...args.where, ...workforceRecordWhere() } }),
  };
}

/** Preserve the project/site and its stored audit history, hide its hidden manager. */
export function publicSite(site) {
  if (!site?.manager) return site;
  if (isLuitAdmin(site.manager.role)) return { ...site, sitManager: null, manager: null };
  const { role, ...manager } = site.manager;
  return { ...site, manager };
}

// ── Staff and Tender Desk directories ────────────────────────────────────
/** Directory scope only. Authentication must continue querying the actual account. */
export function employeeDirectoryWhere(where = {}) {
  return { AND: [where, { OR: [{ role: null }, { NOT: { role: { equals: LUIT_ADMIN_ROLE, mode: 'insensitive' } } }] }] };
}

/** DeskPerson uses an employeeId scalar, not a Prisma Employee relation. */
export async function personDirectoryWhere(db, where = {}) {
  // Employee.findMany leaves the Luit admin out globally; this ID-only lookup
  // never reaches directory callers.
  const hidden = await luitAdminEmployeeIds(db);
  return {
    AND: [where, { OR: [{ employeeId: null }, { employeeId: { notIn: [...hidden] } }] }],
  };
}

export async function findDirectoryPerson(db, id) {
  if (!id) return null;
  return db.person.findFirst({ where: await personDirectoryWhere(db, { id }) });
}

// ── Tender Desk records ──────────────────────────────────────────────────
export function hideLuitAdminOnTender(tender, hidden) {
  if (!tender) return tender;
  const maskActor = row => {
    const copy = { ...row };
    for (const key of ['createdById','uploadedById','addedById','personId']) if (hidden.has(copy[key])) copy[key] = null;
    for (const key of ['person','uploadedBy']) if (hidden.has(copy[key]?.id)) copy[key] = null;
    return copy;
  };
  const result = maskActor(tender);
  if (tender.documents) result.documents = tender.documents.map(maskActor);
  if (tender.selections) result.selections = tender.selections.filter(row => !hidden.has(row.personId));
  if (tender.activities) result.activities = tender.activities.filter(row => !hidden.has(row.personId));
  if (tender.checklist) result.checklist = tender.checklist.map(row => ({...maskActor(row), ticks: (row.ticks || []).filter(tick => !hidden.has(tick.personId))}));
  for (const key of ['instruments','applications']) if (tender[key]) result[key] = tender[key].map(maskActor);
  return result;
}
export function hideLuitAdminOnFetch(log, hidden) {
  return log && hidden.has(log.personId) ? {...log,personId:null,person:null} : log;
}
