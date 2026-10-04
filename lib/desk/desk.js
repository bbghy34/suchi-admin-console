import { redactActorFields } from '@/lib/luit-admin/privacy.mjs';
import { luitAdminPersonIds } from '@/lib/luit-admin/privacy.mjs';
import { prisma } from '@/lib/prisma';
import { luitAdminEmployeeIds } from '@/lib/luit-admin/account.mjs';
import { AWARDED_STAGES, HELD_STATUSES } from './constants';
import { daysUntil, istDateKey } from './ist';
import { fetchAssigneeFor, fetchDayStatus, fetchStreak } from './fetch-day';
import { getFirmName, getWorkCategories } from './settings';
import { unreadCount } from './notify';
import { decorateRow } from './search';
import { heldTotal, nextExpiryReminder, sumWhere } from './money';

export async function shellData(person) {
  const dateKey = istDateKey();
  const [unread, day, assignment, streak, firmName] = await Promise.all([
    unreadCount(person.id),
    fetchDayStatus(dateKey),
    fetchAssigneeFor(dateKey),
    fetchStreak(),
    getFirmName(),
  ]);
  const isFetcher = person.id === assignment.assignee?.id || person.id === assignment.backup?.id || person.isAdmin || person.isExecutive;
  return {
    unread,
    firmName,
    streak,
    fetch: {
      dateKey,
      open: day.open,
      total: day.total,
      done: day.done,
      complete: day.complete,
      finishedAt: day.finishedAt,
      finishedBy: day.finishedBy,
      assignee: assignment.assignee ? { id: assignment.assignee.id, name: assignment.assignee.name } : null,
      backup: assignment.backup ? { id: assignment.backup.id, name: assignment.backup.name } : null,
      override: assignment.override
        ? { fromDate: assignment.override.fromDate, toDate: assignment.override.toDate, note: assignment.override.note }
        : null,
      isFetcher,
    },
  };
}

export async function dashboardPiles(person) {
  const now = new Date();
  const selectedWhere = { selections: { some: { personId: person.id } } };

  const sdWhere = {
    stage: { in: AWARDED_STAGES },
    instruments: { some: { category: 'SD', status: { in: HELD_STATUSES } } },
    ...(person.isAccounts || person.isAdmin ? {} : selectedWhere),
  };
  const held = await prisma.tender.findMany({
    where: sdWhere,
    include: {
      source: { select: { id: true, displayName: true } },
      selections: { select: { personId: true, frequency: true } },
      instruments: { select: { id: true, category: true, status: true, amount: true } },
    },
    orderBy: { updatedAt: 'desc' },
    take: 20,
  });

  const savedSelections = await prisma.selection.findMany({
    where: { personId: person.id },
    include: {
      tender: {
        include: {
          source: { select: { id: true, displayName: true } },
          selections: { select: { personId: true, frequency: true } },
          instruments: { select: { id: true, category: true, status: true, amount: true } },
          checklist: { include: { ticks: { select: { personId: true } } } },
        },
      },
    },
    orderBy: { selectedAt: 'desc' },
  });
  const reminders = { in3: [], in7: [], ago: [], saved: [] };
  for (const selection of savedSelections) {
    const item = reminderItem(selection, person, now);
    reminders[item.band].push(item);
  }
  for (const list of Object.values(reminders)) {
    list.sort((a, b) => (a.days ?? 99) - (b.days ?? 99));
  }

  const realCount = await prisma.tender.count({ where: { isSample: false } });
  const sampleCount = await prisma.tender.count({ where: { isSample: true } });

  return {
    held: held.map((t) => decorateRow(t, person)),
    reminders,
    realCount,
    sampleCount,
  };
}

const CRITERIA_SECTIONS = new Set(['eligibility', 'financial', 'certificates']);

function reminderItem(selection, person, now) {
  const t = selection.tender;
  const row = decorateRow(t, person);
  const days = daysUntil(t.bidSubmissionEnd, now);
  const closed = ['NOT_AWARDED', 'CLOSED'].includes(t.stage);
  const open = (t.checklist || []).filter((c) => !(c.ticks || []).some((k) => k.personId === person.id));
  let band = 'saved';
  if (!closed && days != null && days >= 0 && days <= 3) band = 'in3';
  else if (!closed && days != null && days > 3 && days <= 7) band = 'in7';
  else if (!closed && days != null && days < 0 && days >= -7) band = 'ago';
  const criteria = [];
  const documents = [];
  for (const item of open) {
    const section = String(item.section || '').toLowerCase();
    if (CRITERIA_SECTIONS.has(section)) criteria.push(item.label);
    else documents.push(item.label);
  }
  return {
    ...row,
    frequency: selection.frequency,
    important: selection.frequency === 'FREQUENT',
    days,
    band,
    criteria,
    documents,
  };
}

export async function myTenders(person) {
  const rows = await prisma.selection.findMany({
    where: { personId: person.id },
    include: {
      tender: {
        include: {
          source: { select: { id: true, displayName: true } },
          selections: { select: { personId: true, frequency: true } },
          instruments: { select: { id: true, category: true, status: true, amount: true } },
        },
      },
    },
    orderBy: { selectedAt: 'desc' },
  });
  return rows.map((s) => ({
    ...decorateRow(s.tender, person),
    frequency: s.frequency,
    selectedAt: s.selectedAt,
    nextDeadline: nextDeadline(s.tender),
  }));
}

function nextDeadline(t) {
  const now = new Date();
  const candidates = [
    ['Bid submission end', t.bidSubmissionEnd],
    ['Pre-bid meeting', t.preBidAt],
    ['Bid opening', t.bidOpeningAt],
  ].filter(([, d]) => d && d > now);
  candidates.sort((a, b) => a[1] - b[1]);
  return candidates[0] ? { label: candidates[0][0], at: candidates[0][1] } : null;
}

export async function fetchPageData() {
  const dateKey = istDateKey();
  const [day, assignment, streak, lastLogs, hiddenIds] = await Promise.all([
    fetchDayStatus(dateKey),
    fetchAssigneeFor(dateKey),
    fetchStreak(),
    prisma.fetchLog.findMany({
      orderBy: { at: 'desc' },
      include: { person: { select: { id: true, name: true, employeeId: true } } },
      take: 400,
    }),
    hiddenEmployeeIds(),
  ]);
  for (const log of lastLogs) {
    if (log.person?.employeeId && hiddenIds.has(log.person.employeeId)) { log.person = null; log.personId = null; }
  }
  const lastBySource = {};
  for (const log of lastLogs) {
    if (!lastBySource[log.sourceId]) lastBySource[log.sourceId] = log;
  }
  return { day, assignment, streak, lastBySource };
}

export async function moneyPageData(person) {
  const where =
    person.isAccounts || person.isAdmin
      ? {}
      : { tender: { selections: { some: { personId: person.id } } } };
  const instruments = await prisma.instrument.findMany({
    where: { AND: [where, { tender: { isSample: false } }] },
    include: {
      tender: { include: { source: { select: { id: true, displayName: true } }, documents: { select: { type: true } }, applications: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  const year = Number(istDateKey().slice(0, 4));
  const totalsFor = (category) => {
    const list = instruments.filter((i) => i.category === category);
    return {
      held: heldTotal(list, category),
      refundApplied: sumWhere(list, (i) => i.category === category && i.status === 'REFUND_APPLIED'),
      refundedThisYear: sumWhere(
        list,
        (i) => i.category === category && i.status === 'REFUNDED' && i.refundedOn && Number(istDateKey(i.refundedOn).slice(0, 4)) === year
      ),
      forfeited: sumWhere(list, (i) => i.category === category && i.status === 'FORFEITED'),
    };
  };
  const byProjectMap = new Map();
  for (const i of instruments) {
    if (!byProjectMap.has(i.tenderId)) {
      const t = i.tender;
      byProjectMap.set(i.tenderId, {
        id: t.id,
        title: t.title,
        isSample: t.isSample,
        sourceName: t.source?.displayName,
        stage: t.stage,
        awardedValue: t.awardedValue,
        hasCertificate: t.documents.some((d) => d.type === 'Completion certificate'),
        hasApplication: t.applications.some((a) => a.kind === 'SD' && a.status !== 'REJECTED'),
        instruments: [],
      });
    }
    byProjectMap.get(i.tenderId).instruments.push(i);
  }
  const projects = [...byProjectMap.values()].map((p) => ({
    ...p,
    emdHeld: heldTotal(p.instruments, 'EMD'),
    sdHeld: heldTotal(p.instruments, 'SD'),
    nextExpiry: p.instruments
      .filter((i) => i.form === 'Bank guarantee' && i.expiryDate && HELD_STATUSES.includes(i.status))
      .map((i) => ({ id: i.id, number: i.number, at: nextExpiryReminder(i.expiryDate) }))
      .filter((x) => x.at).sort((a, b) => a.at - b.at)[0],
  }));
  return redactActorFields({
    emd: instruments.filter((i) => i.category === 'EMD'),
    sd: instruments.filter((i) => i.category === 'SD'),
    emdTotals: totalsFor('EMD'),
    sdTotals: totalsFor('SD'),
    projects,
  }, await luitAdminPersonIds(prisma));
}

function hiddenEmployeeIds() {
  return luitAdminEmployeeIds(prisma);
}

export async function peoplePageData() {
  const [people, sources, assignments, firmName, workCategories, assigneeId, backupId, hiddenIds] = await Promise.all([
    prisma.person.findMany({ where: { employeeId: { not: null } }, orderBy: { name: 'asc' } }),
    prisma.source.findMany({ orderBy: { order: 'asc' } }),
    prisma.fetchAssignment.findMany({ orderBy: { createdAt: 'desc' }, take: 20, include: { person: { select: { id: true, name: true, employeeId: true } } } }),
    getFirmName(),
    getWorkCategories(),
    prisma.setting.findUnique({ where: { key: 'fetchAssigneeId' } }),
    prisma.setting.findUnique({ where: { key: 'fetchBackupId' } }),
    hiddenEmployeeIds(),
  ]);
  const visiblePeople = people.filter((p) => !p.employeeId || !hiddenIds.has(p.employeeId));
  const visibleAssignments = assignments.filter(row => !hiddenIds.has(row.person?.employeeId));
  const visibleIds = new Set(visiblePeople.map(person => person.id));
  return {
    people: visiblePeople.map((p) => ({ id: p.id, name: p.name, roles: p.roles })),
    sources,
    assignments: visibleAssignments,
    firmName,
    workCategories,
    fetchAssigneeId: visibleIds.has(assigneeId?.value) ? assigneeId.value : '',
    fetchBackupId: visibleIds.has(backupId?.value) ? backupId.value : '',
  };
}

export { getFirmName, getWorkCategories };
