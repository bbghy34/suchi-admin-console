import clsx from 'clsx';

export { formatIST, formatISTDate, relativeDays, daysUntil, istDateKey } from './ist';

export function cn(...args) {
  return clsx(...args);
}

/** ₹12,50,000 with Indian grouping. */
export function formatINR(value, { blank = '—' } = {}) {
  if (value == null || value === '' || Number.isNaN(Number(value))) return blank;
  const n = Number(value);
  const negative = n < 0;
  const abs = Math.abs(n);
  const whole = Math.floor(abs);
  const paise = Math.round((abs - whole) * 100);
  const s = String(whole);
  let grouped;
  if (s.length <= 3) grouped = s;
  else {
    const last3 = s.slice(-3);
    const rest = s.slice(0, -3);
    grouped = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + last3;
  }
  const paiseStr = paise ? `.${String(paise).padStart(2, '0')}` : '';
  return `${negative ? '-' : ''}₹${grouped}${paiseStr}`;
}

export function parseAmount(value) {
  if (value == null || value === '') return null;
  const n = Number(String(value).replace(/[₹,\s]/g, ''));
  return Number.isNaN(n) ? null : n;
}

export function titleCase(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function truncate(s, n = 80) {
  if (!s) return '';
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

/** State, All India + place of work, or GeM consignee state. */
export function placeLabel(row) {
  if (row.gemConsigneeState) return `${row.gemConsigneeState} (consignee)`;
  if (row.allIndia) {
    return row.placeOfWork
      ? `All India · ${row.placeOfWork}${row.placeOfWorkState && !row.placeOfWork.includes(row.placeOfWorkState) ? `, ${row.placeOfWorkState}` : ''}`
      : 'All India';
  }
  return row.state || row.placeOfWorkState || '—';
}
