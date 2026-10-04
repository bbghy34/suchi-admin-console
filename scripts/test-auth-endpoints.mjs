import { PrismaClient } from '@prisma/client';
import { hashPassword, comparePassword, signToken, verifyToken, ROLES } from '../lib/auth.js';

const prisma = new PrismaClient();
const BASE_URL = 'http://localhost:3000';

async function runAuthTests() {
  console.log('=== STARTING AUTHENTICATION SUITE TESTS ===\n');

  // Test 1: Unit test password hashing & comparison
  console.log('Test 1: Password hashing & verification with bcrypt');
  const password = 'SecurePassword123!';
  const hash = await hashPassword(password);
  const isValid = await comparePassword(password, hash);
  const isInvalid = await comparePassword('WrongPassword', hash);
  if (isValid && !isInvalid) {
    console.log('  [PASS] bcrypt hash and compare works as expected');
  } else {
    throw new Error('bcrypt hash/compare failed');
  }

  // Test 2: Unit test JWT signing & verifying
  console.log('\nTest 2: JWT signing and verification');
  const payload = { id: 'test-id', email: 'admin@suchii.com', role: ROLES.ADMIN };
  const token = signToken(payload);
  const decoded = verifyToken(token);
  if (decoded && decoded.email === payload.email && decoded.role === ROLES.ADMIN) {
    console.log('  [PASS] JWT signing and verification succeeded');
  } else {
    throw new Error('JWT signing/verification failed');
  }

  // Create a test department & test employee in DB for end-to-end API testing
  console.log('\nSetting up test department and employees (Admin, Manager, Employee)...');
  const dept = await prisma.department.create({
    data: {
      name: 'Test Engineering',
      description: 'Department for testing auth',
    },
  });

  const testPassword = 'Password@123';
  const testPasswordHash = await hashPassword(testPassword);

  const adminUser = await prisma.employee.create({
    data: {
      email: 'admin.test@suchiigroup.com',
      name: 'Suchii Admin',
      deptId: dept.id,
      role: ROLES.ADMIN, // 'A'
      passwordHash: testPasswordHash,
    },
  });

  const managerUser = await prisma.employee.create({
    data: {
      email: 'manager.test@suchiigroup.com',
      name: 'Suchii Manager',
      deptId: dept.id,
      role: ROLES.MANAGER, // 'M'
      passwordHash: testPasswordHash,
    },
  });

  const employeeUser = await prisma.employee.create({
    data: {
      email: 'employee.test@suchiigroup.com',
      name: 'Suchii Worker',
      deptId: dept.id,
      role: ROLES.EMPLOYEE, // 'E'
      passwordHash: testPasswordHash,
    },
  });

  console.log('  [PASS] Created test accounts for roles A, M, and E');

  try {
    // Test 3: POST /api/auth/login with invalid password
    console.log('\nTest 3: POST /api/auth/login with invalid password');
    const badLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: adminUser.email,
        password: 'IncorrectPassword',
      }),
    });
    const badLoginData = await badLoginRes.json();
    console.log(`  Response status: ${badLoginRes.status}`, badLoginData);
    if (badLoginRes.status === 401 && badLoginData.success === false) {
      console.log('  [PASS] Rejected invalid password with 401 Unauthorized');
    } else {
      throw new Error('Failed to reject bad credentials');
    }

    // Test 4: POST /api/auth/login with valid credentials
    console.log('\nTest 4: POST /api/auth/login with valid credentials');
    const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: adminUser.email,
        password: testPassword,
      }),
    });
    const loginData = await loginRes.json();
    console.log(`  Response status: ${loginRes.status}`);
    console.log(`  Token returned: ${loginData.token ? 'YES' : 'NO'}`);
    console.log(`  Employee email: ${loginData.employee?.email}`);
    console.log(`  Employee role: ${loginData.employee?.role}`);
    console.log(`  PasswordHash present: ${loginData.employee?.passwordHash !== undefined ? 'YES (SECURITY RISK)' : 'NO (SECURE)'}`);

    if (
      loginRes.status === 200 &&
      loginData.success === true &&
      loginData.token &&
      loginData.employee?.passwordHash === undefined &&
      loginData.employee?.role === 'A'
    ) {
      console.log('  [PASS] Login succeeded, token returned, passwordHash withheld');
    } else {
      throw new Error('Login endpoint failed expectations');
    }

    const adminToken = loginData.token;

    // Test 5: GET /api/auth/me without token
    console.log('\nTest 5: GET /api/auth/me without token (unauthenticated)');
    const meNoTokenRes = await fetch(`${BASE_URL}/api/auth/me`);
    const meNoTokenData = await meNoTokenRes.json();
    console.log(`  Response status: ${meNoTokenRes.status}`, meNoTokenData);
    if (meNoTokenRes.status === 401 && meNoTokenData.success === false) {
      console.log('  [PASS] Correctly blocked unauthenticated request with 401');
    } else {
      throw new Error('GET /api/auth/me allowed unauthenticated request');
    }

    // Test 6: GET /api/auth/me with Bearer token
    console.log('\nTest 6: GET /api/auth/me with valid Bearer token');
    const meRes = await fetch(`${BASE_URL}/api/auth/me`, {
      headers: {
        Authorization: `Bearer ${adminToken}`,
      },
    });
    const meData = await meRes.json();
    console.log(`  Response status: ${meRes.status}`);
    console.log(`  Employee returned: ${meData.employee?.name} (${meData.employee?.email})`);
    console.log(`  Role: ${meData.employee?.role}`);
    console.log(`  Department: ${meData.employee?.department?.name}`);
    console.log(`  PasswordHash present: ${meData.employee?.passwordHash !== undefined ? 'YES (FAIL)' : 'NO (PASS)'}`);

    if (
      meRes.status === 200 &&
      meData.success === true &&
      meData.employee?.email === adminUser.email &&
      meData.employee?.passwordHash === undefined
    ) {
      console.log('  [PASS] GET /api/auth/me verified successfully');
    } else {
      throw new Error('GET /api/auth/me failed expectations');
    }

    // Test 7: POST /api/auth/logout
    console.log('\nTest 7: POST /api/auth/logout');
    const logoutRes = await fetch(`${BASE_URL}/api/auth/logout`, {
      method: 'POST',
    });
    const logoutData = await logoutRes.json();
    console.log(`  Response status: ${logoutRes.status}`, logoutData);
    if (logoutRes.status === 200 && logoutData.success === true) {
      console.log('  [PASS] POST /api/auth/logout succeeded');
    } else {
      throw new Error('POST /api/auth/logout failed');
    }

    // Test 8: Login with Manager ('M') and Employee ('E') roles
    console.log('\nTest 8: Role verification on login (M and E)');
    const mgrRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: managerUser.email, password: testPassword }),
    });
    const mgrData = await mgrRes.json();
    console.log(`  Manager role returned: ${mgrData.employee?.role} (Expected 'M')`);

    const empRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: employeeUser.email, password: testPassword }),
    });
    const empData = await empRes.json();
    console.log(`  Employee role returned: ${empData.employee?.role} (Expected 'E')`);

    if (mgrData.employee?.role === 'M' && empData.employee?.role === 'E') {
      console.log('  [PASS] Roles A, M, and E are all supported and accurately issued');
    } else {
      throw new Error('Role verification failed');
    }

  } finally {
    // Cleanup test records
    console.log('\nCleaning up test records from database...');
    await prisma.employee.deleteMany({
      where: {
        email: {
          in: [adminUser.email, managerUser.email, employeeUser.email],
        },
      },
    });
    await prisma.department.delete({ where: { id: dept.id } });
    console.log('  [PASS] Database cleaned up successfully');
    await prisma.$disconnect();
  }

  console.log('\n=== ALL AUTHENTICATION TESTS PASSED 100% ===');
}

runAuthTests().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
