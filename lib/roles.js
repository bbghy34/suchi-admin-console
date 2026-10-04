import { isLuitAdmin, LUIT_ADMIN_ROLE } from './luit-admin/account.mjs';

/** The Luit admin's stored role. Never offered in a role picker and never listed. */
export { LUIT_ADMIN_ROLE, isLuitAdmin };

/** Daily-tender login. Not staff: hidden from employee, site, and department lists. */
export const TENDER_ROLE = 'T';

/** Accountant. Bills and parties only, plus the account pages needed to sign in. */
export const ACCOUNTANT_ROLE = 'AA';

export function isTenderRole(role) {
  return role === TENDER_ROLE;
}

/** Accounts that must not appear as staff on employee, site, or department screens. */
export function isExcludedStaffRole(role) {
  return isLuitAdmin(role) || role === TENDER_ROLE;
}

/** Drop a linked person from a screen when they are not staff. */
export function visiblePerson(person) {
  if (!person || typeof person !== 'object') return person || null;
  if (isExcludedStaffRole(person.role)) return null;
  if (!('role' in person)) return person;
  const { role, ...visible } = person;
  return visible;
}

/** Bills and parties are open to the accountant role and the Luit admin. */
export function canViewBills(role) {
  return role === ACCOUNTANT_ROLE || isLuitAdmin(role);
}

/** Tender Desk and the Tenders page are open to the Luit admin only. */
export function canUseTenderDesk(role) {
  return isLuitAdmin(role);
}

export function isAssignableRole(role) {
  const value = String(role || '').trim().toUpperCase();
  return value === 'A' || value === 'M' || value === ACCOUNTANT_ROLE;
}

/** What the screen and the session may say. The Luit admin shows as an admin and is not named. */
export function publicRole(role) {
  return isLuitAdmin(role) ? 'A' : role;
}
