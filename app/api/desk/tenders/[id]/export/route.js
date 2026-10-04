import { prisma } from '@/lib/prisma';
import { requirePerson } from '@/lib/desk/auth';
import { handler, fail } from '@/lib/desk/api';
import { parseSummary } from '@/lib/desk/tender-service';
import { bidDetailRows, buildBidDetails } from '@/lib/desk/bid-details';

export const GET = handler(async (req, { params }) => {
  await requirePerson();
  const tender = await prisma.tender.findUnique({
    where: { id: params.id },
    include: { source: true },
  });
  if (!tender) return fail(404, 'Tender not found.');
  const details = buildBidDetails(tender, parseSummary(tender));
  const format = new URL(req.url).searchParams.get('format') || 'json';
  const base = `bid-details-${tender.id.slice(0, 8)}`;

  if (format === 'csv') {
    const lines = ['Section,Field,Value', ...bidDetailRows(details).map((row) => row.map(csvCell).join(','))];
    return file(lines.join('\n'), 'text/csv; charset=utf-8', `${base}.csv`);
  }
  if (format === 'xlsx') {
    const XLSX = (await import('xlsx')).default || (await import('xlsx'));
    const sheet = XLSX.utils.aoa_to_sheet([['Section', 'Field', 'Value'], ...bidDetailRows(details)]);
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, 'Bid details');
    const body = XLSX.write(book, { type: 'buffer', bookType: 'xlsx' });
    return file(body, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', `${base}.xlsx`);
  }
  if (format === 'pdf') {
    return file(bidDetailsPdf(details), 'application/pdf', `${base}.pdf`);
  }
  return file(JSON.stringify(details, null, 2), 'application/json', `${base}.json`);
});

function csvCell(value) {
  const text = String(value ?? '');
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function file(body, type, name) {
  return new Response(body, {
    headers: {
      'content-type': type,
      'content-disposition': `attachment; filename="${name}"`,
    },
  });
}

function bidDetailsPdf(details) {
  const lines = [details.title, ''];
  for (const group of details.groups) {
    lines.push(group.name);
    for (const [field, value] of group.fields) {
      const text = `${field}: ${value}`;
      for (let i = 0; i < text.length; i += 90) lines.push(text.slice(i, i + 90));
    }
    lines.push('');
  }
  const safe = lines.map((line) => line.replace(/[^\x20-\x7e]/g, ' '));
  const pages = [];
  for (let i = 0; i < safe.length; i += 46) pages.push(safe.slice(i, i + 46));
  if (!pages.length) pages.push(['Not Available']);

  const fontId = 3 + pages.length * 2;
  const kids = [];
  const objects = [
    { id: 1, body: '<< /Type /Catalog /Pages 2 0 R >>' },
    { id: 2, body: '' },
  ];
  pages.forEach((pageLines, index) => {
    const pageId = 3 + index * 2;
    const contentId = pageId + 1;
    kids.push(`${pageId} 0 R`);
    const commands = ['BT', '/F1 10 Tf', '48 760 Td', '14 TL', `(${pdfEscape('Bid details')}) Tj`, 'T*'];
    for (const line of pageLines) commands.push(`(${pdfEscape(line)}) Tj`, 'T*');
    commands.push('ET');
    const stream = commands.join('\n');
    objects.push({
      id: pageId,
      body: `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${contentId} 0 R /Resources << /Font << /F1 ${fontId} 0 R >> >> >>`,
    });
    objects.push({
      id: contentId,
      body: `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
    });
  });
  objects[1].body = `<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${pages.length} >>`;
  objects.push({ id: fontId, body: '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>' });

  let body = '%PDF-1.4\n';
  const offsets = [];
  for (const obj of objects) {
    offsets[obj.id] = Buffer.byteLength(body);
    body += `${obj.id} 0 obj\n${obj.body}\nendobj\n`;
  }
  const start = Buffer.byteLength(body);
  const size = fontId + 1;
  body += `xref\n0 ${size}\n0000000000 65535 f \n`;
  for (let id = 1; id < size; id++) body += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
  body += `trailer\n<< /Size ${size} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;
  return Buffer.from(body);
}

function pdfEscape(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}
