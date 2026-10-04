export async function warehouseApi(url, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
  const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
  if (token && !headers.Authorization) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(url, { credentials: 'include', ...options, headers });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.success === false) {
    throw new Error(json.message || 'Request failed.');
  }
  return json.data;
}

export function formatWhen(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function readPath(row, key) {
  return String(key).split('.').reduce((current, part) => current?.[part], row);
}

export const fieldClass = 'mt-1 block w-full rounded-lg px-3 py-2 text-sm outline-none';
export const fieldStyle = { background: 'var(--md-sidebar)', border: '1px solid var(--md-border-strong)', color: 'var(--md-on)' };
