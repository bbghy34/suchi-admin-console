import { uploadToGCS, deleteFromGCS } from '@/lib/gcs';
import {
  TREASURY_IMAGE_MAX_BYTES,
  billDocExtension,
  treasuryImageError,
  treasuryImageName,
} from '@/lib/bills';

const MIME = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  pdf: 'application/pdf',
};

const ALLOWED_PREFIXES = ['project-payments/', 'boq-bills/'];

/**
 * Upload one bill image into object storage.
 * Returns { ok: true, name, path } or { ok: false, message }.
 */
export async function storeBillDocument(file, { folder = 'project-payments', label = 'Treasury bill image', anyFile = false } = {}) {
  const noun = String(label || 'Treasury bill image');
  const lower = noun.charAt(0).toLowerCase() + noun.slice(1);
  if (!file || typeof file === 'string') {
    return { ok: false, message: `${noun} is required.` };
  }
  const message = treasuryImageError({ name: file.name, size: file.size || 0 }, noun, { anyFile });
  if (message) return { ok: false, message };
  if (file.size > TREASURY_IMAGE_MAX_BYTES) {
    return { ok: false, message: `Each ${lower} must be 20MB or smaller.` };
  }

  const named = treasuryImageName(file.name, noun, { anyFile });
  if (!named.ok) return named;

  const ext = billDocExtension(named.value);
  const buffer = Buffer.from(await file.arrayBuffer());
  // Files are served inline from our origin, so never trust the browser's type (e.g. text/html, image/svg+xml).
  const stored = await uploadToGCS(buffer, named.value, folder, MIME[ext] || 'application/octet-stream');
  if (!stored?.gcsPath?.startsWith(`${folder}/`)) {
    return { ok: false, message: `Could not store the ${lower}.` };
  }
  return { ok: true, name: named.value, path: stored.gcsPath };
}

/**
 * Upload several bill images. Removes any that were stored if one fails.
 * Returns { ok: true, documents: [{ name, path }] } or { ok: false, message }.
 */
export async function storeBillDocuments(files, options) {
  const stored = [];
  try {
    for (const file of files) {
      const document = await storeBillDocument(file, options);
      if (!document.ok) {
        await removeBillDocuments(stored.map((item) => item.path));
        return document;
      }
      stored.push({ name: document.name, path: document.path });
    }
    return { ok: true, documents: stored };
  } catch (error) {
    await removeBillDocuments(stored.map((item) => item.path));
    throw error;
  }
}

export async function removeBillDocument(storagePath) {
  const path = String(storagePath || '');
  if (!ALLOWED_PREFIXES.some((prefix) => path.startsWith(prefix)) || path.includes('..')) return;
  try {
    await deleteFromGCS(path);
  } catch (error) {
    console.warn(`Could not delete treasury bill "${path}":`, error?.message || error);
  }
}

export async function removeBillDocuments(storagePaths) {
  const paths = Array.isArray(storagePaths) ? storagePaths : [];
  await Promise.all(paths.map((path) => removeBillDocument(path)));
}

/** Multipart file parts named `files` or `file`. */
export function treasuryBillFiles(formData) {
  return [...formData.getAll('files'), ...formData.getAll('file')].filter(
    (file) => file && typeof file !== 'string' && file.name
  );
}

/**
 * Paths of images the client wants to keep.
 * `undefined` when the field was not sent.
 */
export function retainedTreasuryBillPaths(formData) {
  if (!formData.has('retained')) return { paths: undefined };
  const raw = formData.get('retained');
  if (typeof raw !== 'string' || !raw.trim()) return { paths: [] };
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== 'string')) {
      return { error: 'Bill images to keep are invalid.' };
    }
    return { paths: parsed };
  } catch {
    return { error: 'Bill images to keep are invalid.' };
  }
}
