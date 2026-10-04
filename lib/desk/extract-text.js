import zlib from 'node:zlib';

/**
 * Read text out of a usual tender file.
 * PDF, Word (.docx and .doc), Excel, RTF, CSV, and plain text.
 * A photo is stored and marked IMAGE. A scan with no text layer is NO_TEXT.
 * Returns { text, status } where status is TEXT, NO_TEXT, IMAGE, or ERROR.
 */
export async function extractNoticeText(buffer, mime, fileName) {
  const ext = extension(fileName);
  const kind = kindOf(mime, ext);
  try {
    if (kind === 'image') return { text: '', status: 'IMAGE' };
    if (kind === 'text') return finish(buffer.toString('utf8'));
    if (kind === 'pdf') return finish(await readPdf(buffer));
    if (kind === 'docx') return finish(readDocx(buffer));
    if (kind === 'doc') return finish(readDoc(buffer));
    if (kind === 'rtf') return finish(readRtf(buffer));
    if (kind === 'sheet') return finish(await readSheet(buffer));
    return { text: '', status: 'NO_TEXT' };
  } catch (err) {
    console.error('extractNoticeText failed', fileName, err?.message);
    return { text: '', status: 'ERROR' };
  }
}

export function extension(fileName) {
  const name = String(fileName || '').toLowerCase();
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot) : '';
}

function kindOf(mime, ext) {
  const type = String(mime || '').toLowerCase();
  if (type.startsWith('image/') || ['.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif', '.gif'].includes(ext)) return 'image';
  if (type === 'application/pdf' || ext === '.pdf') return 'pdf';
  if (type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || ext === '.docx') return 'docx';
  if (type === 'application/msword' || ext === '.doc') return 'doc';
  if (type === 'application/rtf' || type === 'text/rtf' || ext === '.rtf') return 'rtf';
  if (
    type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    type === 'application/vnd.ms-excel' ||
    ext === '.xlsx' ||
    ext === '.xls'
  ) {
    return 'sheet';
  }
  if (type === 'text/plain' || type === 'text/csv' || ext === '.txt' || ext === '.csv') return 'text';
  return 'other';
}

function finish(raw) {
  const text = String(raw || '')
    .replace(/\u0000/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (text.replace(/\s+/g, '').length < 40) return { text: '', status: 'NO_TEXT' };
  return { text, status: 'TEXT' };
}

async function readPdf(buffer) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const data = new Uint8Array(buffer);
  const doc = await pdfjs.getDocument({ data, verbosity: 0, isEvalSupported: false }).promise;
  const pageCount = Math.min(doc.numPages || 0, 60);
  const lines = [];
  for (let i = 1; i <= pageCount; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    let line = '';
    let lastY = null;
    for (const item of content.items) {
      const str = item?.str || '';
      const y = item?.transform?.[5];
      if (lastY != null && y != null && Math.abs(y - lastY) > 2) {
        lines.push(line);
        line = str;
      } else {
        line += str;
      }
      lastY = y ?? lastY;
    }
    if (line) lines.push(line);
  }
  if (typeof doc.destroy === 'function') await doc.destroy();
  return lines.join('\n');
}

function readDocx(buffer) {
  const xml = unzipEntry(buffer, 'word/document.xml');
  if (!xml) return '';
  return xml
    .toString('utf8')
    .replace(/<w:tab\/>/g, '\t')
    .replace(/<w:br\/>/g, '\n')
    .replace(/<\/w:p>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function readDoc(buffer) {
  const utf16 = readableRuns(buffer, 2);
  const latin = readableRuns(buffer, 1);
  return utf16.length >= latin.length ? utf16 : latin;
}

function readableRuns(buffer, width) {
  const parts = [];
  let run = '';
  const step = width === 2 ? 2 : 1;
  for (let i = 0; i + step <= buffer.length; i += step) {
    const code = width === 2 ? buffer.readUInt16LE(i) : buffer[i];
    const keep = code === 9 || code === 10 || code === 13 || (code >= 32 && code <= 126) || (code >= 160 && code <= 591);
    if (keep) {
      run += code === 13 ? '\n' : String.fromCharCode(code);
    } else if (run.replace(/\s+/g, '').length >= 12) {
      parts.push(run.trim());
      run = '';
    } else {
      run = '';
    }
  }
  if (run.replace(/\s+/g, '').length >= 12) parts.push(run.trim());
  return parts.join('\n');
}

function readRtf(buffer) {
  return buffer
    .toString('latin1')
    .replace(/\\par[d]?/g, '\n')
    .replace(/\\tab/g, '\t')
    .replace(/\\'([0-9a-fA-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\[a-zA-Z]+-?\d* ?/g, '')
    .replace(/[{}]/g, '');
}

async function readSheet(buffer) {
  const mod = await import('xlsx');
  const XLSX = mod.default || mod;
  const book = XLSX.read(buffer, { type: 'buffer' });
  return book.SheetNames.map((name) => {
    const sheet = book.Sheets[name];
    const csv = XLSX.utils.sheet_to_csv(sheet);
    return book.SheetNames.length > 1 ? `${name}\n${csv}` : csv;
  }).join('\n');
}

function unzipEntry(buffer, wanted) {
  const marker = Buffer.from([0x50, 0x4b, 0x05, 0x06]);
  const eocd = buffer.lastIndexOf(marker);
  if (eocd < 0) return null;
  const count = buffer.readUInt16LE(eocd + 10);
  let cursor = buffer.readUInt32LE(eocd + 16);
  const target = wanted.replace(/\\/g, '/');
  for (let i = 0; i < count; i++) {
    if (cursor + 46 > buffer.length || buffer.readUInt32LE(cursor) !== 0x02014b50) return null;
    const method = buffer.readUInt16LE(cursor + 10);
    const compSize = buffer.readUInt32LE(cursor + 20);
    const nameLen = buffer.readUInt16LE(cursor + 28);
    const extraLen = buffer.readUInt16LE(cursor + 30);
    const commentLen = buffer.readUInt16LE(cursor + 32);
    const localOff = buffer.readUInt32LE(cursor + 42);
    const name = buffer.slice(cursor + 46, cursor + 46 + nameLen).toString('utf8').replace(/\\/g, '/');
    if (name === target) {
      if (compSize === 0xffffffff) return null;
      const localNameLen = buffer.readUInt16LE(localOff + 26);
      const localExtraLen = buffer.readUInt16LE(localOff + 28);
      const start = localOff + 30 + localNameLen + localExtraLen;
      const raw = buffer.slice(start, start + compSize);
      if (method === 0) return raw;
      if (method === 8) return zlib.inflateRawSync(raw);
      return null;
    }
    cursor += 46 + nameLen + extraLen + commentLen;
  }
  return null;
}
