import { luitAdminPersonIds, hideLuitAdminOnFetch } from '@/lib/luit-admin/privacy.mjs';
import { prisma } from '@/lib/prisma';
import { LUIT_ADMIN_ROLE } from '@/lib/luit-admin/account.mjs';
import { SETTING_KEYS } from './constants';
import { addDaysKey, isWeekdayKey, istDateKey } from './ist';

/** Who fetches on a given IST date, honouring admin date-range overrides. */
export async function fetchAssigneeFor(dateKey = istDateKey()) {
  const [settings, override, hiddenRows] = await Promise.all([
    prisma.setting.findMany({ where: { key: { in: [SETTING_KEYS.FETCH_ASSIGNEE, SETTING_KEYS.FETCH_BACKUP] } }, select: { key: true, value: true } }),
    prisma.fetchAssignment.findFirst({
      where: { fromDate: { lte: dateKey }, toDate: { gte: dateKey } },
      orderBy: { createdAt: 'desc' }, include: { person: true },
    }),
    prisma.$queryRaw`SELECT id FROM "Employee" WHERE UPPER(TRIM(role)) = ${LUIT_ADMIN_ROLE}`,
  ]);
  const assigneeId = settings.find(row => row.key === SETTING_KEYS.FETCH_ASSIGNEE)?.value || null;
  const backupId = settings.find(row => row.key === SETTING_KEYS.FETCH_BACKUP)?.value || null;
  const ids = [...new Set([override?.personId, assigneeId, backupId].filter(Boolean))];
  const people = ids.length ? await prisma.person.findMany({ where: { id: { in: ids } } }) : [];
  const hidden = new Set(hiddenRows.map(row => row.id));
  const visible = (person) => (person && hidden.has(person.employeeId) ? null : person);
  const byId = Object.fromEntries(people.map((p) => [p.id, p]));
  return {
    assignee: visible(byId[override?.personId]) || visible(byId[assigneeId]) || null,
    backup: visible(byId[backupId]) || null,
    override: override && visible(override.person) ? override : null,
    defaultAssigneeId: visible(byId[assigneeId]) ? assigneeId : null,
  };
}

export async function dailySources() {
  return prisma.source.findMany({ where: { isDaily: true }, orderBy: { order: 'asc' } });
}

/** Checklist state for one IST date. */
export async function fetchDayStatus(dateKey = istDateKey()) {
  const [sources, logs] = await Promise.all([
    dailySources(),
    prisma.fetchLog.findMany({ where: { date: dateKey }, include: { person: { select: { id: true, name: true } } } }),
  ]);
  const hidden = await luitAdminPersonIds(prisma);
  const visibleLogs = logs.map(log => hideLuitAdminOnFetch(log, hidden));
  const logBySource = Object.fromEntries(visibleLogs.map((l) => [l.sourceId, l]));
  const rows = sources.map((s) => ({ source: s, log: logBySource[s.id] || null }));
  const open = rows.filter((r) => !r.log);
  const finishedAt = open.length === 0 && logs.length ? logs.reduce((a, l) => (a > l.at ? a : l.at), logs[0].at) : null;
  const lastBy = finishedAt ? visibleLogs.find((l) => l.at.getTime() === finishedAt.getTime())?.person : null;
  return {
    dateKey,
    rows,
    total: rows.length,
    done: rows.length - open.length,
    open: open.length,
    complete: open.length === 0 && rows.length > 0,
    started: logs.length > 0,
    finishedAt,
    finishedBy: lastBy || null,
  };
}

/** Consecutive finished weekdays ending today or yesterday. Weekends are skipped, not punished. */
export async function fetchStreak(now = new Date()) {
  const total = await prisma.source.count({ where: { isDaily: true } });
  if (!total) return 0;
  let key = istDateKey(now);
  let streak = 0;
  let allowSkipToday = true;
  for (let i = 0; i < 60; i++) {
    if (!isWeekdayKey(key)) {
      key = addDaysKey(key, -1);
      continue;
    }
    const count = await prisma.fetchLog.count({ where: { date: key } });
    if (count >= total) {
      streak++;
    } else if (allowSkipToday && key === istDateKey(now)) {
      // Today may still be in progress.
    } else {
      break;
    }
    allowSkipToday = false;
    key = addDaysKey(key, -1);
  }
  return streak;
}

/** The assigned fetcher, the backup, or an admin may upload a tender and its documents. */
export function canUploadFetch(person, day) {
  if (!person) return false;
  if (person.isAdmin) return true;
  return person.id === day?.assignee?.id || person.id === day?.backup?.id;
}
export function canWorkFetch(person, day) {
  if (!person) return false;
  if (person.isExecutive || person.isAdmin) return true;
  return person.id === day.assignee?.id || person.id === day.backup?.id;
}
