import { PrismaClient } from '@prisma/client';
import { hashPassword, signToken, ROLES } from '../lib/auth.js';

const prisma = new PrismaClient();
const BASE_URL = 'http://localhost:3000';

async function testEmployeesApi() {
  console.log('=== STARTING EMPLOYEES REST API TEST SUITE ===\n');

  const passwordHash = await hashPassword('AdminPass@123');

  // Setup: Department & Designation
  const testDept = await prisma.department.create({
    data: { name: 'Marine Engineering Div', description: 'Marine projects' },
  });

  const testDesig = await prisma.designation.create({
    data: { title: 'Chief Marine Officer', description: 'Marine operations' },
  });

  const testSite = await prisma.site.create({
    data: { name: 'Mumbai Port Site', address: 'Mumbai Docks' },
  });

  // Admin user to run requests
  const adminUser = await prisma.employee.create({
    data: {
      email: 'emp.admin@suchiigroup.com',
      employeeCode: 'ADMIN001',
      name: 'System Admin',
      deptId: testDept.id,
      designationId: testDesig.id,
      role: ROLES.ADMIN, // 'A'
      passwordHash,
    },
  });

  // Regular staff user to test permissions
  const staffUser = await prisma.employee.create({
    data: {
      email: 'emp.staff@suchiigroup.com',
      employeeCode: 'STAFF001',
      name: 'Regular Staff',
      deptId: testDept.id,
      designationId: testDesig.id,
      role: ROLES.EMPLOYEE, // 'E'
      passwordHash,
    },
  });

  const adminToken = signToken({ id: adminUser.id, role: adminUser.role, email: adminUser.email });
  const staffToken = signToken({ id: staffUser.id, role: staffUser.role, email: staffUser.email });

  let createdEmpId = null;

  try {
    // Test 1: GET without auth
    console.log('Test 1: GET /api/employees without token');
    const unauthRes = await fetch(`${BASE_URL}/api/employees`);
    console.log(`  Status: ${unauthRes.status}`);
    if (unauthRes.status === 401) {
      console.log('  [PASS] Correctly rejected unauthenticated GET');
    } else {
      throw new Error('Test 1 failed: Expected 401');
    }

    // Test 2: POST missing required fields
    console.log('\nTest 2: POST /api/employees missing required fields');
    const missingRes = await fetch(`${BASE_URL}/api/employees`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ name: 'Incomplete User' }),
    });
    const missingData = await missingRes.json();
    console.log(`  Status: ${missingRes.status}, Message: "${missingData.message}"`);
    if (missingRes.status === 400 && !missingData.success) {
      console.log('  [PASS] Correctly rejected missing required fields');
    } else {
      throw new Error('Test 2 failed');
    }

    // Test 3: POST duplicate employeeCode
    console.log('\nTest 3: POST /api/employees duplicate employeeCode check');
    const dupCodeRes = await fetch(`${BASE_URL}/api/employees`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        employeeCode: 'ADMIN001', // already used
        email: 'unique.email@suchiigroup.com',
        name: 'Duplicate Code User',
        deptId: testDept.id,
        designationId: testDesig.id,
        joinDate: '2026-01-01',
        password: 'Password123',
        role: 'E',
      }),
    });
    const dupCodeData = await dupCodeRes.json();
    console.log(`  Status: ${dupCodeRes.status}, Message: "${dupCodeData.message}"`);
    if (dupCodeRes.status === 400 && !dupCodeData.success) {
      console.log('  [PASS] Duplicate employeeCode rejected');
    } else {
      throw new Error('Test 3 failed');
    }

    // Test 4: POST duplicate email
    console.log('\nTest 4: POST /api/employees duplicate email check');
    const dupEmailRes = await fetch(`${BASE_URL}/api/employees`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        employeeCode: 'EMP999',
        email: 'emp.admin@suchiigroup.com', // already used
        name: 'Duplicate Email User',
        deptId: testDept.id,
        designationId: testDesig.id,
        joinDate: '2026-01-01',
        password: 'Password123',
        role: 'E',
      }),
    });
    const dupEmailData = await dupEmailRes.json();
    console.log(`  Status: ${dupEmailRes.status}, Message: "${dupEmailData.message}"`);
    if (dupEmailRes.status === 400 && !dupEmailData.success) {
      console.log('  [PASS] Duplicate email rejected');
    } else {
      throw new Error('Test 4 failed');
    }

    // Test 5: POST create valid employee
    console.log('\nTest 5: POST /api/employees create valid employee');
    const createRes = await fetch(`${BASE_URL}/api/employees`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        employeeCode: 'EMP101',
        email: 'raj.kumar@suchiigroup.com',
        name: 'Raj Kumar',
        deptId: testDept.id,
        designationId: testDesig.id,
        siteId: testSite.id,
        joinDate: '2026-02-15T00:00:00.000Z',
        password: 'PlainPasswordToHash!123',
        role: 'M',
        status: 'true',
        phone: '+91 98765 43210',
      }),
    });
    const createData = await createRes.json();
    console.log(`  Status: ${createRes.status}`);
    console.log(`  Created ID: ${createData.data?.id}`);
    console.log(`  passwordHash in response: ${createData.data?.passwordHash !== undefined ? 'YES (FAIL - EXPOSED)' : 'NO (PASS - HIDDEN)'}`);
    console.log(`  Department attached: ${createData.data?.department?.name}`);
    console.log(`  Designation attached: ${createData.data?.designation?.title}`);

    if (
      createRes.status === 201 &&
      createData.success &&
      createData.data?.passwordHash === undefined &&
      createData.data?.id
    ) {
      console.log('  [PASS] Employee created, password hashed with bcrypt, passwordHash withheld');
      createdEmpId = createData.data.id;
    } else {
      throw new Error('Test 5 failed: Employee creation failed');
    }

    // Verify in DB that password was hashed
    const dbRecord = await prisma.employee.findUnique({ where: { id: createdEmpId } });
    console.log(`  DB passwordHash starts with $2: ${dbRecord?.passwordHash?.startsWith('$2')}`);
    if (dbRecord?.passwordHash && dbRecord.passwordHash.startsWith('$2')) {
      console.log('  [PASS] Verified bcrypt hash stored in database (not plain text)');
    } else {
      throw new Error('Password was not hashed with bcrypt!');
    }

    // Test 6: GET /api/employees with query parameters
    console.log('\nTest 6: GET /api/employees with query filters & includes');
    const queryUrl = `${BASE_URL}/api/employees?page=1&limit=10&department=${testDept.id}&designation=${testDesig.id}&status=true&role=M`;
    const filterRes = await fetch(queryUrl, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const filterData = await filterRes.json();
    console.log(`  Status: ${filterRes.status}`);
    console.log(`  Results count: ${filterData.data?.length}`);
    const foundEmp = filterData.data?.[0];
    console.log(`  Found Employee: ${foundEmp?.name}`);
    console.log(`  Included Department: ${foundEmp?.department?.name}`);
    console.log(`  Included Designation: ${foundEmp?.designation?.title}`);
    console.log(`  Included Site: ${foundEmp?.site?.name}`);
    console.log(`  passwordHash exposed in list: ${foundEmp?.passwordHash !== undefined ? 'YES (FAIL)' : 'NO (PASS)'}`);

    if (
      filterRes.status === 200 &&
      foundEmp?.id === createdEmpId &&
      foundEmp?.department?.name === testDept.name &&
      foundEmp?.designation?.title === testDesig.title &&
      foundEmp?.site?.name === testSite.name &&
      foundEmp?.passwordHash === undefined
    ) {
      console.log('  [PASS] Filtered search, includes (Department, Designation, Site), and security verified');
    } else {
      throw new Error('Test 6 failed: Query filters or includes failed');
    }

    // Test 7: GET /api/employees/[id]
    console.log('\nTest 7: GET /api/employees/[id]');
    const singleRes = await fetch(`${BASE_URL}/api/employees/${createdEmpId}`, {
      headers: { Authorization: `Bearer ${staffToken}` },
    });
    const singleData = await singleRes.json();
    console.log(`  Status: ${singleRes.status}`);
    console.log(`  Employee: ${singleData.data?.name} (${singleData.data?.employeeCode})`);
    console.log(`  passwordHash present: ${singleData.data?.passwordHash !== undefined ? 'YES (FAIL)' : 'NO (PASS)'}`);
    if (singleRes.status === 200 && singleData.data?.id === createdEmpId && singleData.data?.passwordHash === undefined) {
      console.log('  [PASS] GET single employee verified');
    } else {
      throw new Error('Test 7 failed');
    }

    // Test 8: PUT /api/employees/[id] profile updates
    console.log('\nTest 8: PUT /api/employees/[id] profile updates');
    const updateRes = await fetch(`${BASE_URL}/api/employees/${createdEmpId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        name: 'Rajesh Kumar',
        phone: '+91 99999 88888',
        address: 'Marine Drive, Mumbai',
        // Attempt to maliciously modify passwordHash directly
        passwordHash: 'plain_injected_hash',
      }),
    });
    const updateData = await updateRes.json();
    console.log(`  Status: ${updateRes.status}`);
    console.log(`  Updated Name: "${updateData.data?.name}"`);
    console.log(`  Updated Phone: "${updateData.data?.phone}"`);
    console.log(`  passwordHash exposed: ${updateData.data?.passwordHash !== undefined ? 'YES (FAIL)' : 'NO (PASS)'}`);

    // Verify in DB that direct passwordHash was ignored
    const updatedDbRecord = await prisma.employee.findUnique({ where: { id: createdEmpId } });
    if (updatedDbRecord.passwordHash !== 'plain_injected_hash' && updatedDbRecord.passwordHash.startsWith('$2')) {
      console.log('  [PASS] Direct passwordHash modification blocked; bcrypt hash preserved');
    } else {
      throw new Error('Direct passwordHash injection succeeded!');
    }

    // Test 9: DELETE with staff role (should be 403 Forbidden)
    console.log('\nTest 9: DELETE /api/employees/[id] by non-admin (staff)');
    const staffDelRes = await fetch(`${BASE_URL}/api/employees/${createdEmpId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${staffToken}` },
    });
    console.log(`  Status: ${staffDelRes.status}`);
    if (staffDelRes.status === 403) {
      console.log('  [PASS] Staff blocked from deleting employee (Admin only)');
    } else {
      throw new Error('Test 9 failed: Non-admin was allowed to delete');
    }

    // Test 10: DELETE by Admin (prefer status=false)
    console.log('\nTest 10: DELETE /api/employees/[id] by Admin (soft-delete status=false)');
    const adminDelRes = await fetch(`${BASE_URL}/api/employees/${createdEmpId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const adminDelData = await adminDelRes.json();
    console.log(`  Status: ${adminDelRes.status}, Message: "${adminDelData.message}"`);
    console.log(`  Updated Employee Status: "${adminDelData.data?.status}"`);

    const softDeletedDb = await prisma.employee.findUnique({ where: { id: createdEmpId } });
    if (adminDelRes.status === 200 && softDeletedDb.status === 'false') {
      console.log('  [PASS] Soft-delete successful: status set to false, employee preserved');
    } else {
      throw new Error('Test 10 failed');
    }

  } finally {
    // Cleanup
    console.log('\nCleaning up test records...');
    if (createdEmpId) {
      await prisma.employee.deleteMany({ where: { id: createdEmpId } });
    }
    await prisma.employee.deleteMany({
      where: { id: { in: [adminUser.id, staffUser.id] } },
    });
    await prisma.site.deleteMany({ where: { id: testSite.id } });
    await prisma.designation.deleteMany({ where: { id: testDesig.id } });
    await prisma.department.deleteMany({ where: { id: testDept.id } });
    await prisma.$disconnect();
    console.log('  [PASS] Database cleaned up successfully');
  }

  console.log('\n=== ALL EMPLOYEES REST API TESTS PASSED 100% ===');
}

testEmployeesApi().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
