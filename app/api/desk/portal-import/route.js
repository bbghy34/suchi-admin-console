import { getImportCapability, runImport } from '@/lib/desk/portal-import/service';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';
export async function GET() { return getImportCapability(); }

// Stream only to clients that opt in. CLI integrations retain JSON and HTTP status codes.
export async function POST(request) {
  if (!request.headers.get('accept')?.includes('application/x-ndjson')) return runImport(request);
  const encoder = new TextEncoder();
  let disconnected = false;
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event) => {
        if (disconnected) return;
        try { controller.enqueue(encoder.encode(JSON.stringify(event) + '\n')); }
        catch { disconnected = true; }
      };
      const heartbeat = setInterval(() => send({ type: 'heartbeat' }), 15000);
      try {
        const response = await runImport(request, send);
        send({ type: 'result', status: response.status, data: await response.json() });
      } catch {
        send({ type: 'result', status: 500, data: { ok: false, error: 'The connection ended unexpectedly. Check Tender Desk before retrying.' } });
      } finally {
        clearInterval(heartbeat);
        if (!disconnected) controller.close();
      }
    },
    cancel() { disconnected = true; },
  });
  return new Response(stream, { headers: {
    'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-store, no-transform',
    'X-Accel-Buffering': 'no',
  } });
}
