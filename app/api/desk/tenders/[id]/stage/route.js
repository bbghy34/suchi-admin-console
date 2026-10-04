import { prisma } from '@/lib/prisma';
import { requirePerson } from '@/lib/desk/auth';
import { handler, ok, fail, readBody, str, num } from '@/lib/desk/api';
import { prepareDocument } from '@/lib/desk/tender-service';
import { saveTenderTransition } from '@/lib/desk/tender-transition';
import { after } from 'next/server';
import { deskAudienceIds, notifyMany, peopleWithRole, selectorIds } from '@/lib/desk/notify';
import { formatISTDate, parseISTInput } from '@/lib/desk/ist';
import { HELD_STATUSES, STAGE_LABEL } from '@/lib/desk/constants';

/**
 * Stage actions. The order is the business order: Selected → Preparing bid →
 * Bid submitted → Got the bid → In execution → Completed → applied → released → Closed.
 * Not awarded branches off after a bid. Completed is set by the completion record, not here.
 */
export const POST = handler(async (req, { params }) => {
  const person = await requirePerson();
  const tender = await prisma.tender.findUnique({ where: { id: params.id }, include: { documents: true, instruments: true } });
  if (!tender) return fail(404, 'Tender not found.');
  const { fields, files } = await readBody(req);
  const stage = str(fields.stage);
  const from = tender.stage;

  const bidderOk = person.isBidder || person.isAdmin;
  const accountsOk = person.isAccounts || person.isAdmin;
  const save = (data, action, detail, document) => saveTenderTransition(tender, person.id, data, { action, detail }, document);
  const notifyAfterSave = (task) => after(async () => {
    try { await task(); } catch { console.error('tender_stage_notification_failed', { tenderId: tender.id, stage }); }
  });

  if (stage === 'PREPARING_BID') {
    if (!bidderOk) return fail(403, 'A Bidder marks this.');
    if (!['UPLOADED', 'SELECTED'].includes(from)) return fail(400, `The tender is already at ${STAGE_LABEL[from]}.`);
    await save({ stage }, 'preparing bid', 'The firm intends to bid');
    return ok({ stage });
  }

  if (stage === 'BID_SUBMITTED') {
    if (!bidderOk) return fail(403, 'A Bidder marks this.');
    if (!['UPLOADED', 'SELECTED', 'PREPARING_BID'].includes(from)) return fail(400, `The tender is already at ${STAGE_LABEL[from]}.`);
    await save({ stage }, 'bid submitted', 'The bid was filed. EMD entry is expected.');
    notifyAfterSave(async () => {
      const accounts = await peopleWithRole('ACCOUNTS');
      const selectors = await selectorIds(tender.id, { frequencies: null });
      const audience = [...new Set([...(await deskAudienceIds()), ...accounts, ...selectors])];
      await notifyMany(audience, {
        tenderId: tender.id,
        kind: 'BID_SUBMITTED',
        title: `Bid submitted for ${tender.title}.`,
        body: tender.emdAmount
          ? `Record the EMD. The notice states ${tender.emdAmount}${tender.emdMode ? ` (${tender.emdMode.toLowerCase()})` : ''}.`
          : 'Record the EMD. The notice did not state an EMD amount on the form.',
        dedupeKey: `bidsubmitted:${tender.id}`,
      });
    });
    return ok({ stage });
  }

  if (stage === 'NOT_AWARDED') {
    if (!bidderOk) return fail(403, 'A Bidder marks this.');
    if (!['UPLOADED', 'SELECTED', 'PREPARING_BID', 'BID_SUBMITTED'].includes(from)) return fail(400, `Cannot mark Not awarded from ${STAGE_LABEL[from]}.`);
    await save({ stage }, 'not awarded', str(fields.note) || 'The firm lost or did not bid. Track EMD refund only.');
    return ok({ stage });
  }

  if (stage === 'GOT_THE_BID') {
    if (!bidderOk) return fail(403, 'A Bidder marks this.');
    if (from !== 'BID_SUBMITTED') {
      return fail(400, from === 'GOT_THE_BID' ? 'The firm already has this bid.' : 'Mark “Bid submitted” first. Getting the bid comes after the bid is filed.');
    }
    const awardDate = parseISTInput(fields.awardDate);
    const awardedValue = num(fields.awardedValue);
    if (!awardDate) return fail(400, 'Enter the date of the letter of acceptance or work order.');
    if (awardedValue == null || awardedValue < 0) return fail(400, 'Enter a non-negative awarded value.');
    const letterType = str(fields.letterType) || 'Letter of acceptance';
    if (!['Letter of acceptance', 'Work order'].includes(letterType)) return fail(400, 'The file must be typed Letter of acceptance or Work order.');
    const letterFile = files.find((f) => f.field === 'file');
    const hasLetter = tender.documents.some((d) => ['Letter of acceptance', 'Work order'].includes(d.type));
    if (!letterFile && !hasLetter) return fail(400, 'Attach the letter of acceptance or work order before marking Got the bid.');
    const document = letterFile ? await prepareDocument({ file: letterFile.file, type: letterType, docDate: awardDate, person }) : null;
    await save({ stage, awardDate, awardedValue }, 'got the bid', `${letterType} dated ${formatISTDate(awardDate)}, awarded value ${awardedValue}`, document);
    notifyAfterSave(async () => {
      const accounts = await peopleWithRole('ACCOUNTS');
      const selectors = await selectorIds(tender.id, { frequencies: ['FREQUENT', 'QUIET'] });
      await notifyMany([...accounts, ...selectors], {
        tenderId: tender.id,
        kind: 'GOT_THE_BID',
        title: `The firm got the bid on ${tender.title}.`,
        body: 'Security money can now be entered: EMD and Security Deposit as separate instruments.',
        dedupeKey: `gotbid:${tender.id}`,
      });
    });
    return ok({ stage });
  }

  if (stage === 'IN_EXECUTION') {
    if (!bidderOk && !accountsOk) return fail(403, 'Accounts or a Bidder marks this.');
    if (from !== 'GOT_THE_BID') return fail(400, `Cannot mark In execution from ${STAGE_LABEL[from]}.`);
    await save({ stage }, 'in execution', 'Work is underway');
    return ok({ stage });
  }

  if (stage === 'CLOSED') {
    if (!accountsOk) return fail(403, 'Admin or Accounts closes a tender.');
    const openMoney = tender.instruments.filter((i) => HELD_STATUSES.includes(i.status) || i.status === 'TO_ARRANGE');
    if (openMoney.length) return fail(400, `There is still open money: ${openMoney.length} instrument${openMoney.length > 1 ? 's' : ''} held or to arrange.`);
    await save({ stage }, 'closed', 'No open money');
    return ok({ stage });
  }

  return fail(400, 'That stage is set elsewhere: Completed by the completion record, and the security money stages by the refund application.');
});
