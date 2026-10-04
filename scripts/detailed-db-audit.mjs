import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function runAudit() {
  console.log('=== RUNNING COMPREHENSIVE POSTGRESQL DATABASE AUDIT ===\n');

  // 1. Audit Tables
  const tablesResult = await prisma.$queryRaw`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    ORDER BY table_name;
  `;
  const existingTables = tablesResult.map((t) => t.table_name);
  console.log('1. TABLES IN DATABASE (' + existingTables.length + '):');
  console.log(existingTables.join(', '));
  console.log('');

  // 2. Audit Foreign Keys via PostgreSQL Catalog (pg_constraint)
  const fkQuery = await prisma.$queryRaw`
    SELECT
      c.conname AS constraint_name,
      src_table.relname AS source_table,
      src_attr.attname AS source_column,
      dst_table.relname AS target_table,
      dst_attr.attname AS target_column
    FROM pg_constraint c
    JOIN pg_namespace n ON n.oid = c.connamespace
    JOIN pg_class src_table ON src_table.oid = c.conrelid
    JOIN pg_attribute src_attr ON src_attr.attrelid = c.conrelid AND src_attr.attnum = ANY(c.conkey)
    JOIN pg_class dst_table ON dst_table.oid = c.confrelid
    JOIN pg_attribute dst_attr ON dst_attr.attrelid = c.confrelid AND dst_attr.attnum = ANY(c.confkey)
    WHERE c.contype = 'f' AND n.nspname = 'public'
    ORDER BY src_table.relname, src_attr.attname;
  `;

  console.log('2. ALL FOREIGN KEY RELATIONSHIPS FOUND IN DATABASE:');
  console.table(fkQuery);

  // 3. Verification of Each Requested Relationship
  console.log('\n3. CHECKING SPECIFIC USER RELATIONSHIPS:\n');

  const checks = [
    {
      name: 'Project.contractor → Contractor.id',
      sourceTable: 'Project',
      sourceCol: 'contractor',
      targetTable: 'Contractor',
      targetCol: 'id',
    },
    {
      name: 'Department → Employee (Employee.deptId → Department.id)',
      sourceTable: 'Employee',
      sourceCol: 'deptId',
      targetTable: 'Department',
      targetCol: 'id',
    },
    {
      name: 'Department → Project (Project.department → Department.id)',
      sourceTable: 'Project',
      sourceCol: 'department',
      targetTable: 'Department',
      targetCol: 'id',
    },
    {
      name: 'Designation → Employee (Employee.designationId → Designation.id)',
      sourceTable: 'Employee',
      sourceCol: 'designationId',
      targetTable: 'Designation',
      targetCol: 'id',
    },
    {
      name: 'Contractor → Project (Project.contractor → Contractor.id)',
      sourceTable: 'Project',
      sourceCol: 'contractor',
      targetTable: 'Contractor',
      targetCol: 'id',
    },
    {
      name: 'Project → Site (Site.projectId → Project.id)',
      sourceTable: 'Site',
      sourceCol: 'projectId',
      targetTable: 'Project',
      targetCol: 'id',
    },
    {
      name: 'Project → BOQs (BOQs.projectId → Project.id)',
      sourceTable: 'BOQs',
      sourceCol: 'projectId',
      targetTable: 'Project',
      targetCol: 'id',
    },
    {
      name: 'Employee → Attendance (Attendance.employeeId → Employee.id)',
      sourceTable: 'Attendance',
      sourceCol: 'employeeId',
      targetTable: 'Employee',
      targetCol: 'id',
    },
    {
      name: 'Site → Attendance (Attendance.siteId → Site.id)',
      sourceTable: 'Attendance',
      sourceCol: 'siteId',
      targetTable: 'Site',
      targetCol: 'id',
    },
    {
      name: 'Employee → Leave (Leave.employeeId → Employee.id)',
      sourceTable: 'Leave',
      sourceCol: 'employeeId',
      targetTable: 'Employee',
      targetCol: 'id',
    },
    {
      name: 'Employee → Site manager (Site.sitManager → Employee.id)',
      sourceTable: 'Site',
      sourceCol: 'sitManager',
      targetTable: 'Employee',
      targetCol: 'id',
    },
  ];

  let allChecksPassed = true;

  for (const chk of checks) {
    const match = fkQuery.find(
      (f) =>
        f.source_table === chk.sourceTable &&
        f.source_column === chk.sourceCol &&
        f.target_table === chk.targetTable &&
        f.target_column === chk.targetCol
    );
    if (match) {
      console.log(`[PASS] ${chk.name}`);
    } else {
      console.log(`[FAIL] ${chk.name} - NOT FOUND OR MISCONFIGURED`);
      allChecksPassed = false;
    }
  }

  // 4. Critical Negative Check
  console.log('\n4. CRITICAL NEGATIVE CHECK:');
  const invalidRel = fkQuery.find(
    (f) =>
      f.source_table === 'Project' &&
      f.source_column === 'contractor' &&
      f.target_table === 'Employee'
  );

  if (invalidRel) {
    console.log('[FAIL CRITICAL] Project.contractor → Employee.id EXISTS! (MUST NOT EXIST)');
    allChecksPassed = false;
  } else {
    console.log('[PASS CRITICAL] Project.contractor → Employee.id DOES NOT exist.');
  }

  console.log('\n=== AUDIT SUMMARY ===');
  console.log('Overall Status:', allChecksPassed ? '100% VALID & VERIFIED' : 'ISSUES DETECTED');

  await prisma.$disconnect();
}

runAudit().catch((err) => {
  console.error('Audit failed with error:', err);
  process.exit(1);
});
