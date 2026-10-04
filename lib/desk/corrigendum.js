import { prisma } from '@/lib/prisma';

export async function attachCorrigendumFields(tenderId, documents) {
  if (!tenderId || !documents?.length) return documents;
  try {
    const rows = await prisma.$queryRawUnsafe(
      'SELECT "id", "changeNote", "previousValue", "updatedValue" FROM "DeskDocument" WHERE "tenderId" = $1',
      tenderId
    );
    const byId = new Map((rows || []).map((row) => [row.id, row]));
    for (const doc of documents) {
      const extra = byId.get(doc.id);
      doc.changeNote = extra?.changeNote || null;
      doc.previousValue = extra?.previousValue || null;
      doc.updatedValue = extra?.updatedValue || null;
    }
  } catch {
    for (const doc of documents) {
      doc.changeNote = doc.changeNote || null;
      doc.previousValue = doc.previousValue || null;
      doc.updatedValue = doc.updatedValue || null;
    }
  }
  return documents;
}

export async function writeCorrigendumChange(documentId, { changeNote, previousValue, updatedValue }) {
  if (!documentId) return;
  const note = clean(changeNote);
  const previous = clean(previousValue);
  const updated = clean(updatedValue);
  if (!note && !previous && !updated) return;
  await prisma.$executeRawUnsafe(
    'UPDATE "DeskDocument" SET "changeNote" = $2, "previousValue" = $3, "updatedValue" = $4 WHERE "id" = $1',
    documentId,
    note,
    previous,
    updated
  );
}

function clean(value) {
  const text = String(value || '').trim();
  return text ? text.slice(0, 2000) : null;
}
