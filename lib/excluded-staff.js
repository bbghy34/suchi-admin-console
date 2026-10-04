import { LUIT_ADMIN_ROLE, TENDER_ROLE } from './roles.js';

const EXCLUDED = [LUIT_ADMIN_ROLE, TENDER_ROLE];

/** How many non-staff accounts sit on each department, designation, or firm. */
export async function excludedStaffCounts(prisma, field) {
  if (field !== 'deptId' && field !== 'designationId' && field !== 'firmId') {
    throw new Error('Unsupported staff field.');
  }
  const rows = await prisma.employee.groupBy({
    by: [field],
    where: { role: { in: EXCLUDED }, [field]: { not: null } },
    _count: { _all: true },
  });
  return new Map(rows.map((row) => [row[field], row._count._all]));
}
