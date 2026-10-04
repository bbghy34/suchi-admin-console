// Indian Standard Time helpers. IST is UTC+5:30 with no daylight saving, so a
// fixed offset is exact and keeps the desk independent of the server clock zone.

export const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function toDate(value) {
  if (value == null) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Shifted Date whose UTC fields equal the IST wall-clock fields. */
export function istParts(value) {
  const d = toDate(value);
  if (!d) return null;
  const s = new Date(d.getTime() + IST_OFFSET_MS);
  return {
    year: s.getUTCFullYear(),
    month: s.getUTCMonth(),
    day: s.getUTCDate(),
    hour: s.getUTCHours(),
    minute: s.getUTCMinutes(),
    weekday: s.getUTCDay(),
  };
}

/** Build a Date from IST wall-clock fields. month is 0-based. */
export function istDate(year, month, day, hour = 0, minute = 0) {
  return new Date(Date.UTC(year, month, day, hour, minute) - IST_OFFSET_MS);
}

/** IST calendar key, e.g. 2026-09-29 */
export function istDateKey(value = new Date()) {
  const p = istParts(value);
  if (!p) return null;
  return `${p.year}-${String(p.month + 1).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

/** Date for an IST calendar key at a given IST time. */
export function istAt(dateKey, hour = 0, minute = 0) {
  const [y, m, d] = dateKey.split('-').map(Number);
  return istDate(y, m - 1, d, hour, minute);
}

export function addDaysKey(dateKey, days) {
  const [y, m, d] = dateKey.split('-').map(Number);
  const s = new Date(Date.UTC(y, m - 1, d + days));
  return `${s.getUTCFullYear()}-${String(s.getUTCMonth() + 1).padStart(2, '0')}-${String(s.getUTCDate()).padStart(2, '0')}`;
}

export function istWeekday(dateKey) {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function isWeekdayKey(dateKey) {
  const w = istWeekday(dateKey);
  return w >= 1 && w <= 5;
}

/** 29-Sep-2026, 3:00 PM IST */
export function formatIST(value, { withTime = true, withZone = true } = {}) {
  const p = istParts(value);
  if (!p) return '—';
  const date = `${String(p.day).padStart(2, '0')}-${MONTHS[p.month]}-${p.year}`;
  if (!withTime) return date;
  const h12 = p.hour % 12 === 0 ? 12 : p.hour % 12;
  const ampm = p.hour < 12 ? 'AM' : 'PM';
  return `${date}, ${h12}:${String(p.minute).padStart(2, '0')} ${ampm}${withZone ? ' IST' : ''}`;
}

export function formatISTDate(value) {
  return formatIST(value, { withTime: false });
}

export function formatISTDayName(value) {
  const p = istParts(value);
  return p ? DAYS[p.weekday] : '';
}

/** Whole days from now until the value, in IST calendar days. */
export function daysUntil(value, now = new Date()) {
  const a = istDateKey(now);
  const b = istDateKey(value);
  if (!a || !b) return null;
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000);
}

export function relativeDays(value, now = new Date()) {
  const n = daysUntil(value, now);
  if (n == null) return '';
  if (n === 0) return 'today';
  if (n === 1) return 'tomorrow';
  if (n === -1) return 'yesterday';
  if (n > 1) return `in ${n} days`;
  return `${-n} days ago`;
}

/** datetime-local input value from a Date, in IST wall-clock. */
export function toInputDateTime(value) {
  const p = istParts(value);
  if (!p) return '';
  return `${p.year}-${String(p.month + 1).padStart(2, '0')}-${String(p.day).padStart(2, '0')}T${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
}

export function toInputDate(value) {
  return istDateKey(value) || '';
}

/**
 * Parse a form value typed in IST. Accepts "YYYY-MM-DD", "YYYY-MM-DDTHH:mm"
 * and ISO strings with a zone.
 */
export function parseISTInput(value) {
  if (!value) return null;
  const s = String(value).trim();
  if (!s) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : new Date(value);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (m) {
    const [y, mo, day, h, min, sec] = m.slice(1).map((v) => Number(v || 0));
    const d = istDate(y, mo - 1, day, h, min);
    const p = istParts(d);
    if (p.year !== y || p.month !== mo - 1 || p.day !== day || p.hour !== h || p.minute !== min || sec > 59) return null;
    return new Date(d.getTime() + sec * 1000);
  }
  if (!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(s)) return null;
  const calendar = s.slice(0, 10);
  if (!parseISTInput(calendar)) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Sunday (end of this week) as IST date key. */
export function endOfWeekKey(now = new Date()) {
  const k = istDateKey(now);
  const w = istWeekday(k);
  const toSunday = w === 0 ? 0 : 7 - w;
  return addDaysKey(k, toSunday);
}
