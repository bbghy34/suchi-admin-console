// Only the selected import uses streaming; the normal API stays JSON-compatible.
export async function readImportResponse(response, onProgress = () => {}) {
  let result;
  if (response.headers.get('content-type')?.includes('application/x-ndjson')) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let pending = '';
    const consume = (line) => {
      if (!line.trim()) return;
      const event = JSON.parse(line);
      if (event.type === 'progress') onProgress(event);
      if (event.type === 'result') result = event;
    };
    try {
      while (true) {
        const { value, done } = await reader.read();
        pending += decoder.decode(value, { stream: !done });
        const lines = pending.split('\n');
        pending = lines.pop();
        for (const line of lines) consume(line);
        if (done) { consume(pending); break; }
      }
    } finally { reader.releaseLock(); }
    if (!result) throw new Error('The progress connection was interrupted. Check Tender Desk before retrying; the save may still finish.');
  } else {
    result = { status: response.status, data: await response.json() };
  }
  if (result.status >= 400 || !result.data?.ok) {
    const err = new Error(result.data?.error || 'Official retrieval could not finish.');
    err.status = result.status;
    err.data = result.data;
    throw err;
  }
  return result.data;
}
