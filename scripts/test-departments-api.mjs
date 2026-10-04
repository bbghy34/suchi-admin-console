import { PrismaClient } from '@prisma/client';
import { hashPassword, signToken, ROLES } from '../lib/auth.js';

const prisma = new PrismaClient();
const BASE_URL = 'http://localhost:3000';

async function testDepartmentsApi() {
  console.log('=== STARTING DEPARTMENTS REST API TEST SUITE ===\n');

  const passwordHash = await hashPassword('TestPass@123');

  // 1. Create an Admin user and an Employee user
  const adminUser = await prisma.employee.create({
    data: {
      email: 'dept.admin@suchiigroup.com',
      name: 'Department Admin',
      role: ROLES.ADMIN, // 'A'
      passwordHash,
    },
  });

  const staffUser = await prisma.employee.create({
    data: {
      email: 'dept.staff@suchiigroup.com',
      name: 'Department Staff',
      role: ROLES.EMPLOYEE, // 'E'
      passwordHash,
    },
  });

  const adminToken = signToken({ id: adminUser.id, role: adminUser.role, email: adminUser.email });
  const staffToken = signToken({ id: staffUser.id, role: staffUser.role, email: staffUser.email });

  let dept1Id = null;
  let dept2Id = null;

  try {
    // Test 1: GET /api/departments without authentication
    console.log('Test 1: GET /api/departments without authentication');
    const unauthRes = await fetch(`${BASE_URL}/api/departments`);
    console.log(`  Status: ${unauthRes.status}`);
    if (unauthRes.status === 401) {
      console.log('  [PASS] Correctly rejected unauthenticated request');
    } else {
      throw new Error('Test 1 failed: Expected 401');
    }

    // Test 2: POST /api/departments without required 'name'
    console.log('\nTest 2: POST /api/departments without name');
    const noNameRes = await fetch(`${BASE_URL}/api/departments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ description: 'No name provided' }),
    });
    const noNameData = await noNameRes.json();
    console.log(`  Status: ${noNameRes.status}, Message: "${noNameData.message}"`);
    if (noNameRes.status === 400 && !noNameData.success) {
      console.log('  [PASS] Rejected missing name with 400 Bad Request');
    } else {
      throw new Error('Test 2 failed');
    }

    // Test 3: POST /api/departments with non-existent HOD
    console.log('\nTest 3: POST /api/departments with invalid HOD');
    const badHodRes = await fetch(`${BASE_URL}/api/departments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        name: 'Invalid HOD Dept',
        HOD: '00000000-0000-0000-0000-000000000000',
      }),
    });
    const badHodData = await badHodRes.json();
    console.log(`  Status: ${badHodRes.status}, Message: "${badHodData.message}"`);
    if (badHodRes.status === 400 && !badHodData.success) {
      console.log('  [PASS] Rejected non-existent HOD employee');
    } else {
      throw new Error('Test 3 failed');
    }

    // Test 4: POST /api/departments with valid data and valid HOD
    console.log('\nTest 4: POST /api/departments create valid department');
    const createRes = await fetch(`${BASE_URL}/api/departments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        name: 'Civil Engineering',
        description: 'Handles infrastructure and construction projects',
        HOD: adminUser.id,
      }),
    });
    const createData = await createRes.json();
    console.log(`  Status: ${createRes.status}`);
    console.log(`  Created Dept ID: ${createData.data?.id}`);
    console.log(`  HOD attached: ${createData.data?.hod?.name} (${createData.data?.hod?.email})`);
    if (createRes.status === 201 && createData.success && createData.data?.hod?.id === adminUser.id) {
      console.log('  [PASS] Department created with HOD verified');
      dept1Id = createData.data.id;
    } else {
      throw new Error('Test 4 failed');
    }

    // Test 5: POST /api/departments duplicate name check
    console.log('\nTest 5: POST /api/departments duplicate name validation');
    const dupRes = await fetch(`${BASE_URL}/api/departments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        name: 'civil engineering', // case-insensitive check
      }),
    });
    const dupData = await dupRes.json();
    console.log(`  Status: ${dupRes.status}, Message: "${dupData.message}"`);
    if (dupRes.status === 400 && !dupData.success) {
      console.log('  [PASS] Duplicate name rejected');
    } else {
      throw new Error('Test 5 failed');
    }

    // Create a second department for testing updates and lists
    const dept2Res = await fetch(`${BASE_URL}/api/departments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        name: 'Procurement & Logistics',
        description: 'Handles vendor supply chain',
      }),
    });
    const dept2Data = await dept2Res.json();
    dept2Id = dept2Data.data?.id;

    // Assign staffUser to dept1Id to test employee counts and delete constraints
    await prisma.employee.update({
      where: { id: staffUser.id },
      data: { deptId: dept1Id },
    });

    // Test 6: GET /api/departments list with employeeCount and HOD
    console.log('\nTest 6: GET /api/departments list verification');
    const listRes = await fetch(`${BASE_URL}/api/departments`, {
      headers: { Authorization: `Bearer ${staffToken}` },
    });
    const listData = await listRes.json();
    console.log(`  Status: ${listRes.status}`);
    console.log(`  Total departments: ${listData.data?.length}`);
    const foundDept1 = listData.data?.find((d) => d.id === dept1Id);
    console.log(`  Dept1 Employee Count: ${foundDept1?.employeeCount} (Expected: 1)`);
    console.log(`  Dept1 HOD Name: ${foundDept1?.hod?.name} (Expected: ${adminUser.name})`);
    if (listRes.status === 200 && foundDept1?.employeeCount === 1 && foundDept1?.hod?.id === adminUser.id) {
      console.log('  [PASS] Employee count and HOD details confirmed in list response');
    } else {
      throw new Error('Test 6 failed');
    }

    // Test 7: GET /api/departments/[id]
    console.log('\nTest 7: GET /api/departments/[id]');
    const getSingleRes = await fetch(`${BASE_URL}/api/departments/${dept1Id}`, {
      headers: { Authorization: `Bearer ${staffToken}` },
    });
    const getSingleData = await getSingleRes.json();
    console.log(`  Status: ${getSingleRes.status}`);
    console.log(`  Name: ${getSingleData.data?.name}`);
    console.log(`  Employee Count: ${getSingleData.data?.employeeCount}`);
    if (getSingleRes.status === 200 && getSingleData.data?.id === dept1Id) {
      console.log('  [PASS] GET /api/departments/[id] verified');
    } else {
      throw new Error('Test 7 failed');
    }

    // Test 8: PUT /api/departments/[id]
    console.log('\nTest 8: PUT /api/departments/[id] update fields');
    const updateRes = await fetch(`${BASE_URL}/api/departments/${dept1Id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        description: 'Updated infrastructure & engineering description',
        HOD: staffUser.id,
      }),
    });
    const updateData = await updateRes.json();
    console.log(`  Status: ${updateRes.status}`);
    console.log(`  Updated Description: "${updateData.data?.description}"`);
    console.log(`  Updated HOD: ${updateData.data?.hod?.name}`);
    if (updateRes.status === 200 && updateData.data?.hod?.id === staffUser.id) {
      console.log('  [PASS] PUT update succeeded');
    } else {
      throw new Error('Test 8 failed');
    }

    // Test 9: DELETE /api/departments/[id] with non-admin (Staff)
    console.log('\nTest 9: DELETE /api/departments/[id] with non-admin role');
    const staffDelRes = await fetch(`${BASE_URL}/api/departments/${dept2Id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${staffToken}` },
    });
    console.log(`  Status: ${staffDelRes.status}`);
    if (staffDelRes.status === 403) {
      console.log('  [PASS] Blocked non-admin with 403 Forbidden');
    } else {
      throw new Error('Test 9 failed: Non-admin was not blocked');
    }

    // Test 10: DELETE /api/departments/[id] when employees are assigned
    console.log('\nTest 10: DELETE /api/departments/[id] blocked due to assigned employees');
    const blockedDelRes = await fetch(`${BASE_URL}/api/departments/${dept1Id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const blockedDelData = await blockedDelRes.json();
    console.log(`  Status: ${blockedDelRes.status}, Message: "${blockedDelData.message}"`);
    if (blockedDelRes.status === 400 && !blockedDelData.success) {
      console.log('  [PASS] Prevented deletion of department with assigned employees');
    } else {
      throw new Error('Test 10 failed: Department with employees was deleted!');
    }

    // Test 11: DELETE /api/departments/[id] on empty department (Admin)
    console.log('\nTest 11: DELETE /api/departments/[id] on department without dependencies');
    const successDelRes = await fetch(`${BASE_URL}/api/departments/${dept2Id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const successDelData = await successDelRes.json();
    console.log(`  Status: ${successDelRes.status}, Message: "${successDelData.message}"`);
    if (successDelRes.status === 200 && successDelData.success) {
      console.log('  [PASS] Clean department deleted successfully');
      dept2Id = null;
    } else {
      throw new Error('Test 11 failed');
    }

  } finally {
    // Cleanup
    console.log('\nCleaning up test records...');
    if (staffUser?.id) {
      await prisma.employee.update({
        where: { id: staffUser.id },
        data: { deptId: null },
      });
    }
    if (dept1Id) {
      await prisma.department.deleteMany({ where: { id: dept1Id } });
    }
    if (dept2Id) {
      await prisma.department.deleteMany({ where: { id: dept2Id } });
    }
    await prisma.employee.deleteMany({
      where: { id: { in: [adminUser.id, staffUser.id] } },
    });
    await prisma.$disconnect();
    console.log('  [PASS] Database cleaned up successfully');
  }

  console.log('\n=== ALL DEPARTMENTS API TESTS PASSED 100% ===');
}

testDepartmentsApi().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
