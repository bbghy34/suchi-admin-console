import { prisma } from '@/lib/prisma';
import { requirePerson } from '@/lib/desk/auth';
import { handler, ok, fail, readBody, str, bool } from '@/lib/desk/api';

/** Add a checklist line by hand. */
export const POST = handler(async (req, { params }) => {
  const person = await requirePerson();
  const { fields } = await readBody(req);
  const label = str(fields.label);
  if (!label) return fail(400, 'Type the document name.');
  const count = await prisma.checklistItem.count({ where: { tenderId: params.id } });
  const item = await prisma.checklistItem.create({
    data: { tenderId: params.id, label, section: 'ADDED', mandatory: bool(fields.mandatory), fromSummary: false, addedById: person.id, order: 1000 + count },
  });
  return ok({ item });
});

/** Tick or untick a line. Ticks are per person. */
export const PATCH = handler(async (req, { params }) => {
  const person = await requirePerson();
  const { fields } = await readBody(req);
  const itemId = str(fields.itemId);
  const item = await prisma.checklistItem.findFirst({ where: { id: itemId, tenderId: params.id } });
  if (!item) return fail(404, 'Checklist line not found.');
  if (bool(fields.ticked)) {
    await prisma.checklistTick.upsert({
      where: { itemId_personId: { itemId, personId: person.id } },
      update: {},
      create: { itemId, personId: person.id },
    });
  } else {
    await prisma.checklistTick.deleteMany({ where: { itemId, personId: person.id } });
  }
  return ok({ itemId, ticked: bool(fields.ticked) });
});

export const DELETE = handler(async (req, { params }) => {
  await requirePerson();
  const itemId = new URL(req.url).searchParams.get('itemId');
  const item = await prisma.checklistItem.findFirst({ where: { id: itemId, tenderId: params.id, fromSummary: false } });
  if (!item) return fail(404, 'Only lines added by hand can be removed.');
  await prisma.checklistItem.delete({ where: { id: itemId } });
  return ok({});
});
