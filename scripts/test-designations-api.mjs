import { PrismaClient } from '@prisma/client';
import { hashPassword, signToken, ROLES } from '../lib/auth.js';

const prisma = new PrismaClient();
const BASE_URL = 'http://localhost:3000';

async function testDesignationsApi() {
  console.log('=== STARTING DESIGNATIONS REST API TEST SUITE ===\n');

  const passwordHash = await hashPassword('DesignationPass!123');

  // Create test Admin, Manager, and Employee
  const adminUser = await prisma.employee.create({
    data: {
      email: 'desig.admin@suchiigroup.com',
      name: 'Desig Admin',
      role: ROLES.ADMIN, // 'A'
      passwordHash,
    },
  });

  const managerUser = await prisma.employee.create({
    data: {
      email: 'desig.manager@suchiigroup.com',
      name: 'Desig Manager',
      role: ROLES.MANAGER, // 'M'
      passwordHash,
    },
  });

  const staffUser = await prisma.employee.create({
    data: {
      email: 'desig.staff@suchiigroup.com',
      name: 'Desig Staff',
      role: ROLES.EMPLOYEE, // 'E'
      passwordHash,
    },
  });

  const adminToken = signToken({ id: adminUser.id, role: adminUser.role, email: adminUser.email });
  const managerToken = signToken({ id: managerUser.id, role: managerUser.role, email: managerUser.email });
  const staffToken = signToken({ id: staffUser.id, role: staffUser.role, email: staffUser.email });

  let desig1Id = null;
  let desig2Id = null;

  try {
    // Test 1: GET without auth
    console.log('Test 1: GET /api/designations without token');
    const unauthRes = await fetch(`${BASE_URL}/api/designations`);
    console.log(`  Status: ${unauthRes.status}`);
    if (unauthRes.status === 401) {
      console.log('  [PASS] Blocked unauthenticated GET with 401');
    } else {
      throw new Error('Test 1 failed: Expected 401');
    }

    // Test 2: POST with role 'E' (employee)
    console.log('\nTest 2: POST /api/designations with employee role E (should be 403)');
    const staffPostRes = await fetch(`${BASE_URL}/api/designations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${staffToken}`,
      },
      body: JSON.stringify({ title: 'Unauthorized Role Test' }),
    });
    console.log(`  Status: ${staffPostRes.status}`);
    if (staffPostRes.status === 403) {
      console.log('  [PASS] Non-admin/non-manager blocked from creating designation');
    } else {
      throw new Error('Test 2 failed: Role E was allowed to create designation');
    }

    // Test 3: POST with role 'M' (Manager)
    console.log('\nTest 3: POST /api/designations with Manager role M');
    const createRes = await fetch(`${BASE_URL}/api/designations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${managerToken}`,
      },
      body: JSON.stringify({
        title: 'Senior Project Engineer',
        description: 'Oversees site execution and engineering deliverables',
      }),
    });
    const createData = await createRes.json();
    console.log(`  Status: ${createRes.status}`);
    console.log(`  Created Title: "${createData.data?.title}"`);
    if (createRes.status === 201 && createData.success) {
      console.log('  [PASS] Manager created designation successfully');
      desig1Id = createData.data.id;
    } else {
      throw new Error('Test 3 failed: Manager creation failed');
    }

    // Test 4: POST duplicate title check
    console.log('\nTest 4: POST /api/designations duplicate title check');
    const dupRes = await fetch(`${BASE_URL}/api/designations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        title: 'senior project engineer', // case-insensitive check
      }),
    });
    const dupData = await dupRes.json();
    console.log(`  Status: ${dupRes.status}, Message: "${dupData.message}"`);
    if (dupRes.status === 400 && !dupData.success) {
      console.log('  [PASS] Duplicate designation title correctly rejected');
    } else {
      throw new Error('Test 4 failed: Duplicate allowed');
    }

    // Create second designation
    const create2Res = await fetch(`${BASE_URL}/api/designations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        title: 'Procurement Specialist',
        description: 'Vendor negotiations and purchase orders',
      }),
    });
    const create2Data = await create2Res.json();
    desig2Id = create2Data.data?.id;

    // Assign staffUser to desig1Id to test employee count and delete constraints
    await prisma.employee.update({
      where: { id: staffUser.id },
      data: { designationId: desig1Id },
    });

    // Test 5: GET /api/designations list
    console.log('\nTest 5: GET /api/designations list verification');
    const listRes = await fetch(`${BASE_URL}/api/designations`, {
      headers: { Authorization: `Bearer ${staffToken}` },
    });
    const listData = await listRes.json();
    console.log(`  Status: ${listRes.status}`);
    console.log(`  Total designations: ${listData.data?.length}`);
    const foundDesig1 = listData.data?.find((d) => d.id === desig1Id);
    console.log(`  Desig1 Employee Count: ${foundDesig1?.employeeCount} (Expected: 1)`);
    if (listRes.status === 200 && foundDesig1?.employeeCount === 1) {
      console.log('  [PASS] Employee count accurately calculated in list response');
    } else {
      throw new Error('Test 5 failed');
    }

    // Test 6: GET /api/designations/[id]
    console.log('\nTest 6: GET /api/designations/[id]');
    const singleRes = await fetch(`${BASE_URL}/api/designations/${desig1Id}`, {
      headers: { Authorization: `Bearer ${staffToken}` },
    });
    const singleData = await singleRes.json();
    console.log(`  Status: ${singleRes.status}`);
    console.log(`  Title: ${singleData.data?.title}, Count: ${singleData.data?.employeeCount}`);
    if (singleRes.status === 200 && singleData.data?.id === desig1Id) {
      console.log('  [PASS] GET single designation verified');
    } else {
      throw new Error('Test 6 failed');
    }

    // Test 7: PUT /api/designations/[id]
    console.log('\nTest 7: PUT /api/designations/[id] update by Manager');
    const putRes = await fetch(`${BASE_URL}/api/designations/${desig1Id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${managerToken}`,
      },
      body: JSON.stringify({
        description: 'Updated engineering responsibilities & quality checks',
      }),
    });
    const putData = await putRes.json();
    console.log(`  Status: ${putRes.status}`);
    console.log(`  Updated Description: "${putData.data?.description}"`);
    if (putRes.status === 200 && putData.success) {
      console.log('  [PASS] PUT update by Manager succeeded');
    } else {
      throw new Error('Test 7 failed');
    }

    // Test 8: DELETE by Manager (should be 403, Admin only)
    console.log('\nTest 8: DELETE /api/designations/[id] by Manager (should be 403)');
    const mgrDelRes = await fetch(`${BASE_URL}/api/designations/${desig2Id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${managerToken}` },
    });
    console.log(`  Status: ${mgrDelRes.status}`);
    if (mgrDelRes.status === 403) {
      console.log('  [PASS] Manager prevented from deleting (Admin only)');
    } else {
      throw new Error('Test 8 failed: Manager allowed to delete');
    }

    // Test 9: DELETE by Admin when employees are assigned
    console.log('\nTest 9: DELETE /api/designations/[id] when employees are assigned');
    const blockedDelRes = await fetch(`${BASE_URL}/api/designations/${desig1Id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const blockedDelData = await blockedDelRes.json();
    console.log(`  Status: ${blockedDelRes.status}, Message: "${blockedDelData.message}"`);
    if (blockedDelRes.status === 400 && !blockedDelData.success) {
      console.log('  [PASS] Prevented deletion of designation with assigned employees');
    } else {
      throw new Error('Test 9 failed: Designation with employees was deleted!');
    }

    // Test 10: DELETE by Admin on empty designation
    console.log('\nTest 10: DELETE /api/designations/[id] on empty designation by Admin');
    const successDelRes = await fetch(`${BASE_URL}/api/designations/${desig2Id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const successDelData = await successDelRes.json();
    console.log(`  Status: ${successDelRes.status}, Message: "${successDelData.message}"`);
    if (successDelRes.status === 200 && successDelData.success) {
      console.log('  [PASS] Admin deleted unassigned designation successfully');
      desig2Id = null;
    } else {
      throw new Error('Test 10 failed');
    }

  } finally {
    // Cleanup
    console.log('\nCleaning up test records...');
    if (staffUser?.id) {
      await prisma.employee.update({
        where: { id: staffUser.id },
        data: { designationId: null },
      });
    }
    if (desig1Id) {
      await prisma.designation.deleteMany({ where: { id: desig1Id } });
    }
    if (desig2Id) {
      await prisma.designation.deleteMany({ where: { id: desig2Id } });
    }
    await prisma.employee.deleteMany({
      where: { id: { in: [adminUser.id, managerUser.id, staffUser.id] } },
    });
    await prisma.$disconnect();
    console.log('  [PASS] Database cleaned up successfully');
  }

  console.log('\n=== ALL DESIGNATIONS REST API TESTS PASSED 100% ===');
}

testDesignationsApi().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
