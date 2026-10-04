import { randomUUID } from 'crypto';
import { prisma } from '@/lib/prisma';
import { getSetting, setSetting } from './settings';
import { onlineTenderSearch } from './ai/online-search';
import { isWeekdayKey, istAt, istDateKey } from './ist';

export const ONLINE_LIVE_CAP = 100;
const SCHEDULE = 'onlineSchedule';
const HOUR = 'onlineScheduleHour';
const LAST = 'onlineScheduleLast';
const NOTE = 'onlineScheduleNote';

let tablesReady = false;

export async function ensureOnlineTables() {
  if (tablesReady) return;
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "DeskOnlineHit" (
      "id" TEXT PRIMARY KEY,
      "query" TEXT NOT NULL,
      "title" TEXT NOT NULL,
      "link" TEXT NOT NULL UNIQUE,
      "site" TEXT,
      "detail" TEXT,
      "eligibility" TEXT,
      "documentsJson" TEXT,
      "fetchedAt" TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "DeskOnlineHitTemp" (
      "id" TEXT PRIMARY KEY,
      "query" TEXT NOT NULL,
      "title" TEXT NOT NULL,
      "link" TEXT NOT NULL,
      "site" TEXT,
      "detail" TEXT,
      "eligibility" TEXT,
      "documentsJson" TEXT,
      "fetchedAt" TIMESTAMP NOT NULL,
      "archivedAt" TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  tablesReady = true;
}

export async function onlineScheduleStatus() {
  await ensureOnlineTables();
  const [schedule, hour, lastRun, note, counts] = await Promise.all([
    getSetting(SCHEDULE, 'off'),
    getSetting(HOUR, '8'),
    getSetting(LAST, ''),
    getSetting(NOTE, ''),
    onlineCounts(),
  ]);
  return {
    schedule: schedule === 'daily' || schedule === 'weekdays' ? schedule : 'off',
    hour: clampHour(hour),
    lastRun: lastRun || null,
    note: note || '',
    liveCount: counts.live,
    tempCount: counts.temp,
    cap: ONLINE_LIVE_CAP,
  };
}

export async function saveOnlineSchedule({ schedule, hour }) {
  const next = schedule === 'daily' || schedule === 'weekdays' ? schedule : 'off';
  await setSetting(SCHEDULE, next);
  await setSetting(HOUR, String(clampHour(hour)));
  return onlineScheduleStatus();
}

/** Cited public pages for this search, already stored. Does not call Gemini. */
export async function listOnlineHits(query, { states = [], department = '' } = {}) {
  await ensureOnlineTables();
  const rows = await prisma.$queryRawUnsafe(
    'SELECT "query", "title", "link", "site", "detail", "eligibility", "documentsJson", "fetchedAt" FROM "DeskOnlineHit" ORDER BY "fetchedAt" DESC LIMIT 100'
  );
  const words = watchWords(query);
  return (rows || [])
    .map(asHit)
    .filter((row) => hitMatches(row, words, states, department))
    .slice(0, 12);
}

/**
 * Pull cited public pages for open fetched tenders and store them.
 * The live table keeps 100 rows. Older rows move to the holding table.
 */
export async function refreshOnlineLibrary(now = new Date()) {
  await ensureOnlineTables();
  const queries = await watchQueries(now);
  if (!queries.length) {
    const note = 'No open fetched tender to watch. Nothing was read from the public web.';
    await setSetting(LAST, now.toISOString());
    await setSetting(NOTE, note);
    const counts = await onlineCounts();
    return { queries, saved: 0, note, ...counts };
  }
  let saved = 0;
  for (const query of queries) {
    const result = await onlineTenderSearch(query);
    saved += await saveOnlineRows(query, result.rows || []);
  }
  await spillOver(ONLINE_LIVE_CAP);
  const counts = await onlineCounts();
  const note = `Stored ${saved} cited pages from ${queries.length} open tenders. Live list ${counts.live} of ${ONLINE_LIVE_CAP}. Holding table ${counts.temp}.`;
  await setSetting(LAST, now.toISOString());
  await setSetting(NOTE, note);
  return { queries, saved, note, ...counts };
}

export async function refreshOnlineIfDue(now = new Date()) {
  const schedule = await getSetting(SCHEDULE, 'off');
  if (schedule !== 'daily' && schedule !== 'weekdays') return null;
  const dateKey = istDateKey(now);
  if (schedule === 'weekdays' && !isWeekdayKey(dateKey)) return null;
  const slot = istAt(dateKey, clampHour(await getSetting(HOUR, '8')), 0);
  if (now < slot) return null;
  const last = await getSetting(LAST, '');
  if (last && new Date(last) >= slot) return null;
  return refreshOnlineLibrary(now);
}

async function watchQueries(now) {
  const open = await prisma.tender.findMany({
    where: {
      isSample: false,
      bidSubmissionEnd: { gte: now },
      stage: { notIn: ['NOT_AWARDED', 'CLOSED'] },
    },
    select: { title: true, state: true, placeOfWorkState: true, workCategory: true },
    orderBy: { bidSubmissionEnd: 'asc' },
    take: 12,
  });
  const queries = [];
  for (const tender of open) {
    const place = tender.state || tender.placeOfWorkState || '';
    const work = tender.workCategory || titleWords(tender.title);
    const query = [work, place, 'tender'].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
    if (query.length >= 8 && !queries.includes(query)) queries.push(query);
    if (queries.length >= 4) break;
  }
  return queries;
}

function titleWords(title) {
  return String(title || '')
    .split(/\s+/)
    .filter((word) => word.length > 2)
    .slice(0, 4)
    .join(' ');
}

async function saveOnlineRows(query, rows) {
  let saved = 0;
  for (const row of rows) {
    const link = String(row.link || '').trim();
    if (!/^https?:\/\//i.test(link)) continue;
    await prisma.$executeRawUnsafe(
      `INSERT INTO "DeskOnlineHit" ("id", "query", "title", "link", "site", "detail", "eligibility", "documentsJson", "fetchedAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
       ON CONFLICT ("link") DO UPDATE SET
         "query" = EXCLUDED."query",
         "title" = EXCLUDED."title",
         "site" = EXCLUDED."site",
         "detail" = EXCLUDED."detail",
         "eligibility" = EXCLUDED."eligibility",
         "documentsJson" = EXCLUDED."documentsJson",
         "fetchedAt" = NOW()`,
      randomUUID(),
      query.slice(0, 240),
      String(row.title || 'Tender page').slice(0, 300),
      link.slice(0, 1000),
      row.site ? String(row.site).slice(0, 160) : null,
      row.detail ? String(row.detail).slice(0, 12000) : null,
      row.eligibility ? String(row.eligibility).slice(0, 600) : null,
      JSON.stringify(row.documents || []).slice(0, 2000)
    );
    saved += 1;
  }
  return saved;
}

async function spillOver(cap) {
  const extra = await prisma.$queryRawUnsafe(
    'SELECT "id", "query", "title", "link", "site", "detail", "eligibility", "documentsJson", "fetchedAt" FROM "DeskOnlineHit" ORDER BY "fetchedAt" DESC OFFSET $1',
    cap
  );
  for (const row of extra || []) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "DeskOnlineHitTemp" ("id", "query", "title", "link", "site", "detail", "eligibility", "documentsJson", "fetchedAt", "archivedAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
      randomUUID(),
      row.query,
      row.title,
      row.link,
      row.site,
      row.detail,
      row.eligibility,
      row.documentsJson,
      row.fetchedAt
    );
    await prisma.$executeRawUnsafe('DELETE FROM "DeskOnlineHit" WHERE "id" = $1', row.id);
  }
}

async function onlineCounts() {
  const live = await prisma.$queryRawUnsafe('SELECT COUNT(*)::int AS n FROM "DeskOnlineHit"');
  const temp = await prisma.$queryRawUnsafe('SELECT COUNT(*)::int AS n FROM "DeskOnlineHitTemp"');
  return { live: countOf(live), temp: countOf(temp) };
}

function countOf(rows) {
  const value = rows?.[0]?.n;
  return typeof value === 'bigint' ? Number(value) : Number(value || 0);
}

function asHit(row) {
  let documents = [];
  try {
    documents = JSON.parse(row.documentsJson || '[]');
  } catch {
    documents = [];
  }
  return {
    title: row.title,
    link: row.link,
    site: row.site || '',
    detail: row.detail || '',
    eligibility: row.eligibility || '',
    documents: Array.isArray(documents) ? documents : [],
    saved: true,
  };
}

function watchWords(query) {
  return String(query || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 2);
}

function hitMatches(row, words, states, department) {
  const blob = `${row.title} ${row.detail} ${row.site} ${row.eligibility}`.toLowerCase();
  if (words.length && !words.every((word) => blob.includes(word))) return false;
  if (states?.length) {
    const named = states.some((state) => blob.includes(String(state).toLowerCase()));
    const northeast = states.length >= 8 && /\bnortheast\b|\bnorth east\b/.test(blob);
    if (!named && !northeast) return false;
  }
  if (department && !blob.includes(String(department).toLowerCase())) return false;
  return true;
}

function clampHour(value) {
  const hour = Number(value);
  if (!Number.isFinite(hour)) return 8;
  return Math.min(23, Math.max(0, Math.round(hour)));
}
