import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

/** Format a project or report amount as Indian rupees. */
export function formatINR(val, { fallback = '—' } = {}) {
  if (val === null || val === undefined || val === '') return fallback;
  const num = Number(val);
  if (!Number.isFinite(num)) return fallback;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
}

/** Role stored beside the httpOnly session cookie so the menu can render before /api/auth/me returns. */
export function readAuthRole() {
  if (typeof document === 'undefined') return '';
  const match = document.cookie.match(/(?:^|;\s*)auth_role=([^;]*)/);
  if (!match) return '';
  const role = decodeURIComponent(match[1]);
  return role === 'A' || role === 'M' || role === 'E' || role === 'AA' || role === 'T' ? role : '';
}

/** Calendar date in the user's timezone, as YYYY-MM-DD. */
export function localDateInput(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}
