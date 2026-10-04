import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function verifySchema() {
  console.log('--- Verifying 9 Tables in PostgreSQL ---');

  const tables = await prisma.$queryRaw`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    ORDER BY table_name;
  `;
  console.log('Tables found in database:', tables.map((t) => t.table_name));

  const expectedTables = [
    'Department',
    'Designation',
    'Employee',
    'Project',
    'Site',
    'BOQs',
    'Attendance',
    'Leave',
    'Contractor',
  ];

  for (const table of expectedTables) {
    const cols = await prisma.$queryRawUnsafe(`
      SELECT column_name, data_type, is_nullable 
      FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = '${table}'
      ORDER BY ordinal_position;
    `);
    console.log(`\nTable [${table}] columns (${cols.length}):`);
    console.log(cols.map((c) => c.column_name).join(', '));
  }

  console.log('\n--- Verifying Foreign Key Relationships ---');
  const fks = await prisma.$queryRaw`
    SELECT
      tc.table_name,
      kcu.column_name,
      ccu.table_name AS foreign_table_name,
      ccu.column_name AS foreign_column_name
    FROM
      information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
        AND ccu.table_schema = tc.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'
    ORDER BY tc.table_name, kcu.column_name;
  `;

  console.table(fks);

  // Critical checks
  const projectContractorFk = fks.find(
    (fk) => fk.table_name === 'Project' && fk.column_name === 'contractor'
  );
  console.log(
    '\nCRITICAL CHECK: Project.contractor references ->',
    projectContractorFk
      ? `${projectContractorFk.foreign_table_name}.${projectContractorFk.foreign_column_name}`
      : 'NOT FOUND'
  );

  const hasContractorId = fks.some(
    (fk) => fk.table_name === 'Project' && fk.column_name === 'contractorId'
  );
  console.log('CRITICAL CHECK: Project.contractorId exists ->', hasContractorId ? 'YES (FAIL)' : 'NO (PASS)');

  const contractorCols = await prisma.$queryRaw`
    SELECT column_name 
    FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'Contractor';
  `;
  const contractorHasStatus = contractorCols.some((c) => c.column_name === 'status');
  console.log('CRITICAL CHECK: Contractor has status column ->', contractorHasStatus ? 'YES (FAIL)' : 'NO (PASS)');

  await prisma.$disconnect();
}

verifySchema().catch((err) => {
  console.error('Verification error:', err);
  process.exit(1);
});
