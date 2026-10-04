import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function testConnection() {
  console.log('Testing Prisma PostgreSQL connection...');
  try {
    await prisma.$connect();
    console.log('SUCCESS: Prisma connected to PostgreSQL successfully.');
    const result = await prisma.$queryRaw`SELECT 1 as connected`;
    console.log('Query test successful:', result);
    const schemas = await prisma.$queryRaw`SELECT schema_name FROM information_schema.schemata`;
    console.log('Schemas:', schemas);
    const allTables = await prisma.$queryRaw`SELECT table_schema, table_name FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog', 'information_schema')`;
    console.log('All non-system tables:', allTables);

    const [depts, projs, contractors, employees] = await Promise.all([
      prisma.department.count(),
      prisma.project.count(),
      prisma.contractor.count(),
      prisma.employee.count(),
    ]);
    console.log(`Prisma Model Query Test: Departments: ${depts}, Projects: ${projs}, Contractors: ${contractors}, Employees: ${employees}`);
  } catch (error) {
    console.error('DATABASE_CONNECTION_ERROR:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

testConnection();
