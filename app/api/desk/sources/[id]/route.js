import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/desk/auth';
import { handler, ok, fail, readBody, str, bool } from '@/lib/desk/api';
import { logActivity } from '@/lib/desk/activity';

/** Admin corrects a stored URL, widens all-India, or switches Coal India subsidiaries. */
export const PATCH = handler(async (req, { params }) => {
  const person = await requireRole('ADMIN');
  const source = await prisma.source.findUnique({ where: { id: params.id } });
  if (!source) return fail(404, 'Source not found.');
  const { fields } = await readBody(req);
  const data = {};
  if (fields.url !== undefined) data.url = str(fields.url) || '';
  if (fields.extraUrls !== undefined) data.extraUrls = str(fields.extraUrls);
  if (fields.allIndia !== undefined) data.allIndia = bool(fields.allIndia);
  if (fields.config !== undefined) data.config = typeof fields.config === 'string' ? fields.config : JSON.stringify(fields.config);
  await prisma.source.update({ where: { id: source.id }, data });
  await logActivity({
    personId: person.id,
    action: 'source edited',
    detail: `${source.displayName}: ${Object.keys(data).join(', ')}`,
  });
  return ok({ sourceId: source.id });
});
