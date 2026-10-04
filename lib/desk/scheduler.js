import { personDirectoryWhere } from '@/lib/luit-admin/privacy.mjs';
import { prisma } from '@/lib/prisma';
import { AWARDED_STAGES, HELD_STATUSES } from './constants';
import { addDaysKey, formatIST, formatISTDate, isWeekdayKey, istAt, istDateKey } from './ist';
import { notify, notifyMany, peopleWithRole } from './notify';
import { fetchAssigneeFor, fetchDayStatus } from './fetch-day';
import { logActivity } from './activity';
import { readNoticeFacts } from './notice-facts';
import { refreshOnlineIfDue } from './online-store';

const DAY_MS = 86400000;
let lastTick = 0;
let running = false;

/**
 * Run the notification schedules. Called on every request (throttled) and by
 * /api/tick, so no separate cron process is needed for a small office.
 */
export async function tick(now = new Date(), { force = false, throwOnError = false } = {}) {
  if (running) return;
  if (!force && Date.now() - lastTick < 60 * 1000) return;
  running = true;
  lastTick = Date.now();
  try {
    await runSchedules(now);
  } catch (err) {
    console.error('scheduler tick failed', err);
    lastTick = 0;
    if (throwOnError) throw err;
  } finally {
    running = false;
  }
}

/** True when `scheduled` has passed within the last 24 hours. Stale reminders never fire. */
function inWindow(scheduled, now) {
  const diff = now.getTime() - scheduled.getTime();
  return diff >= 0 && diff < DAY_MS;
}

function morningOf(dateKey, offsetDays = 0) {
  return istAt(addDaysKey(dateKey, -offsetDays), 8, 0);
}

export async function runSchedules(now = new Date()) {
  await markRenewalDue(now);
  await fetchReminders(now);
  await selectionReminders(now);
  await quietDigests(now);
  await documentDateReminders(now);
  try {
    await refreshOnlineIfDue(now);
  } catch (err) {
    console.error('online refresh failed', err?.message);
  }
}

async function markRenewalDue(now) {
  const soon = new Date(now.getTime() + 30 * DAY_MS);
  const rows = await prisma.instrument.findMany({
    where: { tender: { isSample: false }, form: 'Bank guarantee', expiryDate: { lte: soon }, status: { in: ['SUBMITTED', 'HELD'] } },
  });
  for (const i of rows) {
    const changed = await prisma.instrument.updateMany({ where: { id: i.id, updatedAt: i.updatedAt, status: i.status }, data: { status: 'RENEWAL_DUE' } });
    if (!changed.count) continue;
    await logActivity({ tenderId: i.tenderId, action: 'status changed', detail: `${i.category === 'SD' ? 'Security Deposit' : 'EMD'} ${i.number || ''}: ${i.status} → RENEWAL_DUE (expires ${formatISTDate(i.expiryDate)})` });
  }
}

async function fetchReminders(now) {
  const dateKey = istDateKey(now);
  const status = await fetchDayStatus(dateKey);
  if (!status.total || status.complete) return;
  if (!isWeekdayKey(dateKey) && !status.started) return;
  const { assignee, backup } = await fetchAssigneeFor(dateKey);
  const admins = await peopleWithRole('ADMIN');
  const recipients = [...new Set([assignee?.id, backup?.id, ...admins].filter(Boolean))];
  for (const [hour, tag] of [[11, '11'], [16, '16']]) {
    const scheduled = istAt(dateKey, hour, 0);
    if (!inWindow(scheduled, now)) continue;
    for (const personId of recipients) {
      await notify({
        personId,
        kind: 'FETCH_OPEN',
        title: 'Today’s portal review is not finished.',
        body: `${status.open} of ${status.total} sources are still open for ${formatISTDate(now)}. Assigned: ${assignee?.name || '—'}; backup: ${backup?.name || '—'}.`,
        dedupeKey: `fetch:${tag}:${dateKey}:${personId}`,
        scheduledFor: scheduled,
      });
    }
  }
}

async function selectionReminders(now) {
  const selections = await prisma.selection.findMany({
    where: { frequency: 'FREQUENT', tender: { isSample: false }, person: { is: await personDirectoryWhere(prisma) } },
    include: {
      tender: {
        include: {
          instruments: true,
          documents: { select: { type: true } },
          checklist: { include: { ticks: { select: { personId: true } } } },
          applications: true,
        },
      },
    },
  });
  const accounts = await peopleWithRole('ACCOUNTS');


  for (const sel of selections) {
    const t = sel.tender;
    const p = sel.personId;
    const endKey = istDateKey(t.bidSubmissionEnd);
    const preBid = t.stage && !AWARDED_STAGES.includes(t.stage) && !['NOT_AWARDED', 'CLOSED'].includes(t.stage);

    if (preBid && t.bidSubmissionEnd > now) {
      for (const offset of [7, 3, 1, 0]) {
        const scheduled = morningOf(endKey, offset);
        if (!inWindow(scheduled, now)) continue;
        await notify({
          personId: p,
          tenderId: t.id,
          kind: 'BID_END',
          title: `Bid submission for ${t.title} ends ${formatIST(t.bidSubmissionEnd)}.`,
          body: offset === 0 ? 'That is today.' : `${offset} day${offset > 1 ? 's' : ''} to go.`,
          dedupeKey: `bidend:${offset}:${t.id}:${endKey}:${p}`,
          scheduledFor: scheduled,
        });
      }

      if (t.preBidAt && t.preBidAt > now) {
        const scheduled = morningOf(istDateKey(t.preBidAt), 1);
        if (inWindow(scheduled, now)) {
          await notify({
            personId: p,
            tenderId: t.id,
            kind: 'PRE_BID',
            title: `Pre-bid meeting for ${t.title} is on ${formatIST(t.preBidAt)} at ${t.preBidPlace || 'the place in the notice'}.`,
            dedupeKey: `prebid:${t.id}:${istDateKey(t.preBidAt)}:${p}`,
            scheduledFor: scheduled,
          });
        }
      }

      const emdStated = (t.emdAmount || 0) > 0 && t.emdMode !== 'Exempted';
      const emdMarked = t.instruments.some((i) => i.category === 'EMD' && (HELD_STATUSES.includes(i.status) || i.status === 'EXEMPTED'));
      const hoursLeft = (t.bidSubmissionEnd.getTime() - now.getTime()) / 3600000;
      if (['SELECTED', 'PREPARING_BID'].includes(t.stage) && emdStated && !emdMarked && hoursLeft <= 48 && hoursLeft > 0) {
        await notify({
          personId: p,
          tenderId: t.id,
          kind: 'EMD_OPEN',
          title: `EMD for ${t.title} is not marked submitted.`,
          body: `The bid ends ${formatIST(t.bidSubmissionEnd)}. EMD stated: ${t.emdAmount}.`,
          dedupeKey: `emd48:${t.id}:${endKey}:${p}`,
        });
        const morning = morningOf(endKey, 0);
        if (inWindow(morning, now)) {
          await notify({
            personId: p,
            tenderId: t.id,
            kind: 'EMD_OPEN',
            title: `EMD for ${t.title} is not marked submitted.`,
            body: `The bid ends today, ${formatIST(t.bidSubmissionEnd)}.`,
            dedupeKey: `emd0:${t.id}:${endKey}:${p}`,
            scheduledFor: morning,
          });
        }
      }

      const openMandatory = t.checklist.filter((c) => c.mandatory && !c.ticks.some((k) => k.personId === p));
      if (openMandatory.length) {
        const scheduled = morningOf(endKey, 1);
        if (inWindow(scheduled, now)) {
          await notify({
            personId: p,
            tenderId: t.id,
            kind: 'CHECKLIST_OPEN',
            title: `Some required documents for ${t.title} are still open.`,
            body: openMandatory.map((c) => c.label).slice(0, 6).join('; '),
            dedupeKey: `chk:${t.id}:${endKey}:${p}`,
            scheduledFor: scheduled,
          });
        }
      }
    }

  }
  // Money remains at risk even when nobody follows a tender.
  const moneyTenders = await prisma.tender.findMany({
    where: { isSample: false, OR: [
      { stage: { in: AWARDED_STAGES } },
      { instruments: { some: { status: { in: HELD_STATUSES } } } },
      { applications: { some: { status: { in: ['SUBMITTED', 'ACKNOWLEDGED'] } } } },
    ] },
    include: { instruments: true, applications: true },
  });
  for (const t of moneyTenders) {
    const selectorIds = selections.filter((s) => s.tenderId === t.id).map((s) => s.personId);
    const recipients = [...new Set([...selectorIds, ...accounts])];

    if (t.awardDate && AWARDED_STAGES.includes(t.stage) && !t.instruments.some((i) => i.category === 'SD')) {
      const awardKey = istDateKey(t.awardDate);
      for (const n of [1, 3, 7]) {
        const scheduled = istAt(addDaysKey(awardKey, n), 8, 0);
        if (!inWindow(scheduled, now)) continue;
        for (const personId of recipients) {
          await notify({
            personId,
            tenderId: t.id,
            kind: 'SD_MISSING',
            title: `Security Deposit for ${t.title} has not been entered.`,
            body: `Day ${n} after the award of ${formatISTDate(t.awardDate)}.`,
            dedupeKey: `sdmissing:${n}:${t.id}:${personId}`,
            scheduledFor: scheduled,
          });
        }
      }
    }

    for (const i of t.instruments) {
      if (i.form !== 'Bank guarantee' || !i.expiryDate || !HELD_STATUSES.includes(i.status)) continue;
      const expKey = istDateKey(i.expiryDate);
      for (const n of [30, 15, 7]) {
        const scheduled = morningOf(expKey, n);
        if (!inWindow(scheduled, now)) continue;
        for (const personId of recipients) {
          await notify({
            personId,
            tenderId: t.id,
            kind: 'BG_EXPIRY',
            title: `Bank guarantee ${i.number || ''} for ${t.title} expires on ${formatISTDate(i.expiryDate)}.`,
            body: `${n} days left. ${i.category === 'SD' ? 'Security Deposit' : 'EMD'} of ${i.amount}.`,
            dedupeKey: `bg:${n}:${i.id}:${expKey}:${personId}`,
            scheduledFor: scheduled,
          });
        }
      }
    }

    const sdApp = t.applications.find((a) => a.kind === 'SD' && a.status !== 'REJECTED');
    if ((!t.sdReleaseEligibleAt || new Date(t.sdReleaseEligibleAt)<=now) && t.completionSavedAt && t.completionDate && !sdApp && t.instruments.some((i) => i.category === 'SD' && HELD_STATUSES.includes(i.status))) {
      const days = Math.floor((now.getTime() - t.completionSavedAt.getTime()) / DAY_MS);
      if (days >= 0) {
        const n = Math.floor(days / 3);
        for (const personId of recipients) {
          await notify({
            personId,
            tenderId: t.id,
            kind: 'SD_APPLY',
            title: `${t.title} is complete. Review the SD refund.`,
            body: `Completion certificate dated ${formatISTDate(t.completionDate)} is on file.`,
            dedupeKey: `sdapply:${t.id}:${n}:${personId}`,
          });
        }
      }
    }

    for (const app of t.applications) {
      if (!['SUBMITTED', 'ACKNOWLEDGED'].includes(app.status) || !app.sentOn) continue;
      const days = Math.floor((now.getTime() - app.sentOn.getTime()) / DAY_MS);
      if (days < 0) continue;
      const n = Math.floor(days / 7);
      const what = app.kind === 'EMD' ? 'EMD refund' : 'Security money';
      for (const personId of recipients) {
        await notify({
          personId,
          tenderId: t.id,
          kind: 'SD_WAITING',
          title: `${what} for ${t.title} is still with ${app.officeName}.`,
          body: `Applied ${formatISTDate(app.sentOn)}. Status: ${app.status === 'ACKNOWLEDGED' ? 'acknowledged' : 'submitted to office'}.`,
          dedupeKey: `sdwait:${app.id}:${n}:${personId}`,
        });
      }
    }
  }
}

let factsDay = '';

/** Once each morning: postponement, extension, and money still held after a completion certificate. */
async function documentDateReminders(now) {
  const dateKey = istDateKey(now);
  if (factsDay === dateKey) return;
  const scheduled = istAt(dateKey, 8, 0);
  if (now < scheduled) return;
  const selections = await prisma.selection.findMany({
    where: { frequency: 'FREQUENT', tender: { isSample: false }, person: { is: await personDirectoryWhere(prisma) } },
    select: { tenderId: true, personId: true },
  });
  const ids = [...new Set(selections.map((row) => row.tenderId))];
  if (!ids.length) {
    factsDay = dateKey;
    return;
  }
  const slots = ids.map((_, index) => `$${index + 1}`).join(', ');
  const [docs, tenders, accounts] = await Promise.all([
    prisma.$queryRawUnsafe(
      `SELECT "id", "tenderId", "type", "fileName", LEFT(COALESCE("extractedText", ''), 4000) AS "extractedText",
              "changeNote", "previousValue", "updatedValue"
       FROM "DeskDocument" WHERE "tenderId" IN (${slots})`,
      ...ids
    ),
    prisma.tender.findMany({
      where: { id: { in: ids } },
      include: { instruments: true, applications: true },
    }),
    peopleWithRole('ACCOUNTS'),
  ]);
  const docsByTender = new Map(ids.map((id) => [id, []]));
  for (const doc of docs || []) docsByTender.get(doc.tenderId)?.push(doc);
  for (const tender of tenders) {
    const facts = readNoticeFacts({
      documents: docsByTender.get(tender.id) || [],
      instruments: tender.instruments,
      applications: tender.applications,
      tender,
    });
    const selectors = selections.filter((row) => row.tenderId === tender.id).map((row) => row.personId);
    for (const item of facts.postponements) {
      await notifyMany(selectors, {
        tenderId: tender.id,
        kind: 'BID_POSTPONED',
        title: `Bid dates for ${tender.title} were postponed.`,
        body: item.line,
        dedupeKey: `postpone:${tender.id}:${clip(item.line)}`,
        scheduledFor: scheduled,
      });
    }
    for (const item of facts.extensions) {
      await notifyMany(selectors, {
        tenderId: tender.id,
        kind: 'BID_EXTENDED',
        title: `A date on ${tender.title} was extended.`,
        body: item.line,
        dedupeKey: `extend:${tender.id}:${clip(item.line)}`,
        scheduledFor: scheduled,
      });
    }
    const cert = facts.completion[0];
    if (!cert) continue;
    const recipients = [...new Set([...selectors, ...accounts])];
    const days = tender.completionSavedAt ? Math.floor((now.getTime() - new Date(tender.completionSavedAt).getTime()) / DAY_MS) : 0;
    const n = Math.max(0, Math.floor(days / 3));
    const when = tender.completionDate ? formatISTDate(tender.completionDate) : 'the date on the certificate';
    if (facts.emdHeld > 0) {
      await notifyMany(recipients, {
        tenderId: tender.id,
        kind: 'EMD_REFUND',
        title: `EMD for ${tender.title} is still held.`,
        body: `Completion certificate ${cert.fileName}, dated ${when}. EMD still held. Earnest money is separate from security deposit.`,
        dedupeKey: `emdheld:${tender.id}:${n}`,
        scheduledFor: scheduled,
      });
    }
    if (facts.sdHeld > 0 && (!tender.sdReleaseEligibleAt || new Date(tender.sdReleaseEligibleAt)<=now)) {
      await notifyMany(recipients, {
        tenderId: tender.id,
        kind: 'SD_RETURN',
        title: `Security deposit for ${tender.title} is still held.`,
        body: `Completion certificate ${cert.fileName}, dated ${when}. Security deposit still held.`,
        dedupeKey: `sdheld:${tender.id}:${n}`,
        scheduledFor: scheduled,
      });
    }
  }
  factsDay = dateKey;
}

function clip(text) {
  return String(text || '').toLowerCase().replace(/\s+/g, ' ').slice(0, 90);
}

async function quietDigests(now) {
  const dateKey = istDateKey(now);
  const scheduled = istAt(dateKey, 8, 0);
  if (!inWindow(scheduled, now)) return;
  const quiet = await prisma.selection.findMany({
    where: { frequency: 'QUIET', tender: { isSample: false } },
    include: { tender: { include: { documents: { where: { type: 'Corrigendum', uploadedAt: { gte: new Date(now.getTime() - DAY_MS) } } } } } },
  });
  const byPerson = new Map();
  for (const s of quiet) {
    if (!byPerson.has(s.personId)) byPerson.set(s.personId, []);
    byPerson.get(s.personId).push(s.tender);
  }
  const horizon = new Date(now.getTime() + 7 * DAY_MS);
  for (const [personId, tenders] of byPerson) {
    const lines = [];
    for (const t of tenders) {
      const dates = [];
      for (const [label, d] of [['bid submission end', t.bidSubmissionEnd], ['pre-bid', t.preBidAt], ['opening', t.bidOpeningAt]]) {
        if (d && d >= now && d <= horizon) dates.push(`${label} ${formatIST(d)}`);
      }
      if (t.documents.length) dates.push(`corrigendum uploaded: ${t.documents.map((d) => d.fileName).join(', ')}`);
      if (dates.length) lines.push(`${t.title}: ${dates.join('; ')}`);
    }
    if (!lines.length) continue;
    await notify({
      personId,
      kind: 'DIGEST',
      title: `Daily digest: ${lines.length} selected tender${lines.length > 1 ? 's' : ''} with a date in the next 7 days.`,
      body: lines.join('\n'),
      dedupeKey: `digest:${dateKey}:${personId}`,
      scheduledFor: scheduled,
    });
  }
}
