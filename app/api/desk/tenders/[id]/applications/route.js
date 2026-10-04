import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/desk/auth';
import { handler, ok, fail, readBody, str } from '@/lib/desk/api';
import { emdRefundGate, groupByOffice, securityMoneyGate } from '@/lib/desk/money';
import { buildLetter } from '@/lib/desk/letter';
import { getFirmName } from '@/lib/desk/settings';

/**
 * Create the refund application(s) as drafts. One application per refund
 * office. The gate must be fully open; otherwise the missing sentences return.
 */
export const POST = handler(async (req, { params }) => {
  const person = await requireRole('ACCOUNTS', 'ADMIN');
  const tender = await prisma.tender.findUnique({ where: { id: params.id }, include: { instruments: true, documents: true, applications: true } });
  if (!tender) return fail(404, 'Tender not found.');
  const { fields } = await readBody(req);
  const kind = str(fields.kind) || 'SD';
  if (!['EMD', 'SD'].includes(kind)) return fail(400, 'Choose EMD or Security Deposit.');

  if (kind === 'EMD' && tender.stage !== 'NOT_AWARDED') return fail(400, 'Apply for EMD refund is for a bid that was not awarded.');
  if (kind === 'SD' && !['COMPLETED', 'GOT_THE_BID', 'IN_EXECUTION', 'SD_APPLIED'].includes(tender.stage)) {
    return fail(400, 'Apply for security money after the firm has the bid and the completion certificate is on the project.');
  }

  const gate = kind === 'EMD' ? emdRefundGate(tender, tender.instruments) : securityMoneyGate(tender, tender.instruments, tender.documents);
  if (!gate.enabled) return fail(400, gate.missing[0], { missing: gate.missing });

  const openDrafts = tender.applications.filter((a) => a.kind === kind && a.status === 'DRAFT');
  if (openDrafts.length) return ok({ applicationIds: openDrafts.map((a) => a.id), reused: true });

  const firmName = await getFirmName();
  const groups = groupByOffice(gate.heldInstruments);
  // A nested write commits all offices together and guards concurrent draft creation.
  const updated = await prisma.tender.update({
    where: { id: tender.id, updatedAt: tender.updatedAt },
    data: { updatedAt: new Date(), applications: { create: groups.map((g) => ({
      kind, status: 'DRAFT',
      letterText: buildLetter({ kind, tender, office: g.office, instruments: g.instruments, firmName }),
      officeName: g.office.officeName, officeDept: g.office.officeDept,
      officeAddress: g.office.officeAddress, officeDistrict: g.office.officeDistrict,
      officeState: g.office.officeState, officerName: g.office.officerName,
      createdById: person.id,
      instruments: { connect: g.instruments.map((i) => ({ id: i.id, updatedAt: i.updatedAt })) },
    })) }, activities: { create: {
      personId: person.id,
      action: kind === 'EMD' ? 'EMD refund drafted' : 'security money drafted',
      detail: `${groups.length} application${groups.length > 1 ? 's' : ''} drafted${groups.length > 1 ? ' (one per refund office)' : ''}`,
    } } },
    include: { applications: { where: { kind, status: 'DRAFT' } } },
  });
  const ids = updated.applications.map((a) => a.id);
  return ok({ applicationIds: ids });
});
