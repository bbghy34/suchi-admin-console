import prisma from '@/lib/prisma';

export async function withPeople(records) {
  const ids = [...new Set(records.flatMap((row) => [row.createdBy, row.updatedBy]).filter(Boolean))];
  const people = ids.length
    ? await prisma.employee.findMany({
        where: { id: { in: ids } },
        select: { id: true, name: true },
      })
    : [];
  const byId = new Map(people.map((person) => [person.id, person]));
  const personOf = (id) => (id ? byId.get(id) || { id, name: id } : null);
  return records.map((row) => ({
    ...row,
    creator: personOf(row.createdBy),
    editor: personOf(row.updatedBy),
  }));
}
