export async function api(url, { method = 'GET', json, form, body, signal } = {}) {
  const opts = { method, credentials: 'same-origin', signal };
  if (form) {
    opts.body = form;
  } else if (json !== undefined) {
    opts.headers = { 'content-type': 'application/json' };
    opts.body = JSON.stringify(json);
  } else if (body) {
    opts.body = body;
  }
  const res = await fetch(url, opts);
  const type = res.headers.get('content-type') || '';
  const data = type.includes('application/json') ? await res.json() : { ok: res.ok, error: res.statusText };
  if (!res.ok || !type.includes('application/json') || !data.ok) {
    const err = new Error(data.error || 'That did not work.');
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}
