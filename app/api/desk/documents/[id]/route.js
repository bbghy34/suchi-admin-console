import { prisma } from '@/lib/prisma';
import { requirePerson } from '@/lib/desk/auth';
import { handler, fail } from '@/lib/desk/api';
import { loadDocumentBytes, readStored } from '@/lib/desk/files';
import path from 'node:path';
import { mimeFromExt } from '@/lib/desk/files';
import { NextResponse } from 'next/server';

export const GET = handler(async (req, { params }) => {
  await requirePerson();
  const doc = await prisma.document.findUnique({ where: { id: params.id } });
  if (!doc) return fail(404, 'Document not found.');
  const download = new URL(req.url).searchParams.get('download') === '1';
  const mime = mimeFromExt(path.extname(doc.fileName || '').toLowerCase());
  const inline = !download && ['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(mime);
  const safeHeaders = { 'content-security-policy': inline ? "default-src 'none'; object-src 'self'; style-src 'unsafe-inline'" : "sandbox; default-src 'none'", 'x-content-type-options': 'nosniff', 'cache-control': 'private, no-store' };
  const disposition = `${inline ? 'inline' : 'attachment'}; filename="${encodeURIComponent(doc.fileName)}"`;
  const storedBytes = await loadDocumentBytes(doc.id);
  if (storedBytes) {
    return new NextResponse(storedBytes, {
      headers: {
        ...safeHeaders,
        'content-type': mime,
        'content-disposition': disposition,
      },
    });
  }
  if (doc.storedName) {
    try {
      const buf = await readStored(doc.storedName);
      return new NextResponse(buf, {
        headers: {
          ...safeHeaders,
        'content-type': mime,
          'content-disposition': disposition,
        },
      });
    } catch (err) {
      if (!['ENOENT', 'EROFS', 'EACCES'].includes(err?.code)) throw err;
    }
  }
  if (doc.extractedText) {
    return new NextResponse(doc.extractedText, {
      headers: {
        ...safeHeaders,
        'content-type': 'text/plain; charset=utf-8',
        'content-disposition': disposition,
      },
    });
  }
  return fail(404, 'This sample document has no stored file. Open the extracted text on the tender if it is there.');
});
