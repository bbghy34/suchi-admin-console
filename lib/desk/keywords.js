import { prisma } from '@/lib/prisma';
import { keywordList, normalizeKeywords } from './keyword-text';

export { keywordList, normalizeKeywords };

/** Pull the column off a Prisma write. The generated client may not know it yet. */
export function takeSearchKeywords(data) {
  const searchKeywords = data.searchKeywords || null;
  const rest = { ...data };
  delete rest.searchKeywords;
  return { data: rest, searchKeywords };
}

export async function writeSearchKeywords(tenderId, stored) {
  await prisma.$executeRaw`
    UPDATE "DeskTender" SET "searchKeywords" = ${stored || null} WHERE id = ${tenderId}
  `;
}

export async function readSearchKeywords(tenderId) {
  const rows = await prisma.$queryRaw`
    SELECT "searchKeywords" FROM "DeskTender" WHERE id = ${tenderId}
  `;
  return rows[0]?.searchKeywords || '';
}

export async function searchKeywordsByTender() {
  const rows = await prisma.$queryRaw`
    SELECT id, "searchKeywords" FROM "DeskTender"
    WHERE "searchKeywords" IS NOT NULL AND "searchKeywords" <> ''
  `;
  const map = {};
  for (const row of rows) map[row.id] = row.searchKeywords;
  return map;
}

export async function listSearchKeywords() {
  const rows = await prisma.$queryRaw`
    SELECT "searchKeywords" FROM "DeskTender"
    WHERE "searchKeywords" IS NOT NULL AND "searchKeywords" <> ''
  `;
  const words = new Set();
  for (const row of rows) {
    for (const word of keywordList(row.searchKeywords)) words.add(word);
  }
  return [...words].sort((a, b) => a.localeCompare(b));
}

/** Tenders tagged with every keyword. Matching is the stored list, not the title. */
export async function tenderIdsForKeywords(keywords) {
  let ids = null;
  for (const raw of keywords || []) {
    const needle = String(raw || '').trim().toLowerCase();
    if (!needle) continue;
    const like = `%,${needle},%`;
    const rows = await prisma.$queryRaw`
      SELECT id FROM "DeskTender"
      WHERE "searchKeywords" IS NOT NULL
        AND (',' || lower("searchKeywords") || ',') LIKE ${like}
    `;
    const found = new Set(rows.map((row) => row.id));
    ids = ids == null ? found : new Set([...ids].filter((id) => found.has(id)));
  }
  return ids ? [...ids] : [];
}
