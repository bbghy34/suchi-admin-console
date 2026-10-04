import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { extractNoticeText } from './extract-text';

export const UPLOAD_DIR = path.join(process.cwd(), 'data', 'uploads');

const ALLOWED_EXT = ['.pdf', '.doc', '.docx', '.rtf', '.txt', '.csv', '.xls', '.xlsx', '.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif', '.gif'];

const ALLOWED_MIME = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/rtf',
  'text/rtf',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'text/csv',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'image/gif',
]);

export function isAllowedUpload(file) {
  const mime = (file.type || '').toLowerCase();
  const ext = path.extname(file.name || '').toLowerCase();
  return ALLOWED_EXT.includes(ext) && (!mime || mime === 'application/octet-stream' || ALLOWED_MIME.has(mime));
}

export async function saveUpload(file) {
  const ext = path.extname(file.name || '').toLowerCase() || guessExt(file.type);
  const storedName = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  try {
    await fs.mkdir(UPLOAD_DIR, { recursive: true });
    await fs.writeFile(path.join(UPLOAD_DIR, storedName), buffer);
  } catch (err) {
    // Vercel’s app directory is read-only. The bytes are kept in DeskDocumentFile.
    if (!['ENOENT', 'EROFS', 'EACCES', 'EPERM'].includes(err?.code)) throw err;
  }
  return { storedName, buffer, mime: mimeFromExt(ext), size: buffer.length, fileName: file.name || storedName };
}

function guessExt(mime) {
  if (mime === 'application/pdf') return '.pdf';
  if (mime === 'application/msword') return '.doc';
  if (mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return '.docx';
  if (mime === 'application/vnd.ms-excel') return '.xls';
  if (mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') return '.xlsx';
  if (mime === 'image/jpeg') return '.jpg';
  if (mime === 'image/png') return '.png';
  if (mime === 'text/plain') return '.txt';
  return '';
}

export function mimeFromExt(ext) {
  const map = {
    '.pdf': 'application/pdf',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.rtf': 'application/rtf',
    '.xls': 'application/vnd.ms-excel',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.csv': 'text/csv',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.heic': 'image/heic',
    '.txt': 'text/plain',
    '.zip': 'application/zip',
  };
  return map[ext] || 'application/octet-stream';
}

export async function readStored(storedName) {
  const safe = path.basename(storedName);
  return fs.readFile(path.join(UPLOAD_DIR, safe));
}

/** Keep the file in Postgres. The serverless disk cannot hold it. */
export async function storeDocumentBytes(documentId, buffer) {
  if (!documentId || !buffer?.length) return;
  const hex = `\\x${buffer.toString('hex')}`;
  await prisma.$executeRawUnsafe(
    'INSERT INTO "DeskDocumentFile" ("documentId", "bytes") VALUES ($1, $2::bytea)',
    documentId,
    hex
  );
}

export async function loadDocumentBytes(documentId) {
  const rows = await prisma.$queryRawUnsafe(
    'SELECT "bytes" FROM "DeskDocumentFile" WHERE "documentId" = $1',
    documentId
  );
  const value = rows?.[0]?.bytes;
  if (!value) return null;
  return Buffer.isBuffer(value) ? value : Buffer.from(value);
}

/**
 * Extract text from an uploaded tender file.
 * PDF, Word, Excel, RTF, and plain text are read. A photo is stored and not read.
 */
export async function extractText(buffer, mime, fileName) {
  return extractNoticeText(buffer, mime, fileName);
}
