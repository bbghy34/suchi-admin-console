import { PrismaClient } from '@prisma/client';
import { hashPassword, ROLES } from '../lib/auth.js';

const prisma = new PrismaClient();
const BASE_URL = 'http://localhost:3000';

async function testLoginFlow() {
  console.log('=== TESTING LOGIN PAGE & AUTHENTICATION FLOW ===\n');

  // 1. Create a test admin user
  const email = 'flow.test@suchiigroup.com';
  const password = 'TestSecurePassword!2026';
  const passwordHash = await hashPassword(password);

  const testUser = await prisma.employee.create({
    data: {
      email,
      name: 'Flow Tester',
      role: ROLES.ADMIN,
      passwordHash,
    },
  });

  try {
    // 2. Test login endpoint with wrong password
    console.log('Step 1: Testing login with wrong credentials...');
    const failRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'WrongPassword999' }),
    });
    const failData = await failRes.json();
    console.log(`  Status: ${failRes.status}, Message: "${failData.message}"`);
    if (failRes.status === 401 && !failData.success) {
      console.log('  [PASS] Correctly rejected bad password with 401');
    } else {
      throw new Error('Failed bad password test');
    }

    // 3. Test login endpoint with valid credentials
    console.log('\nStep 2: Testing login with valid credentials...');
    const successRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const successData = await successRes.json();
    console.log(`  Status: ${successRes.status}`);
    console.log(`  Token present: ${!!successData.token}`);
    console.log(`  passwordHash exposed in payload: ${successData.employee?.passwordHash !== undefined ? 'YES (UNSAFE)' : 'NO (SECURE)'}`);
    console.log(`  Employee: ${successData.employee?.name}, Role: ${successData.employee?.role}`);

    if (
      successRes.status === 200 &&
      successData.success &&
      successData.token &&
      successData.employee?.passwordHash === undefined
    ) {
      console.log('  [PASS] Login successful, token issued, passwordHash omitted');
    } else {
      throw new Error('Valid login test failed');
    }

    const token = successData.token;

    // 4. Test accessing protected me endpoint with issued token
    console.log('\nStep 3: Accessing /api/auth/me using issued token...');
    const meRes = await fetch(`${BASE_URL}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const meData = await meRes.json();
    console.log(`  Status: ${meRes.status}`);
    console.log(`  Authenticated as: ${meData.employee?.name} (${meData.employee?.email})`);
    if (meRes.status === 200 && meData.employee?.email === email) {
      console.log('  [PASS] Protected session active with token');
    } else {
      throw new Error('Token verification on /api/auth/me failed');
    }

    // 5. Test logout
    console.log('\nStep 4: Testing logout endpoint...');
    const logoutRes = await fetch(`${BASE_URL}/api/auth/logout`, { method: 'POST' });
    const logoutData = await logoutRes.json();
    console.log(`  Status: ${logoutRes.status}, Message: "${logoutData.message}"`);
    if (logoutRes.status === 200 && logoutData.success) {
      console.log('  [PASS] Logout successful');
    } else {
      throw new Error('Logout test failed');
    }

    // 6. Test GET /login page accessibility
    console.log('\nStep 5: Verifying /login page serves HTTP 200...');
    const loginPageRes = await fetch(`${BASE_URL}/login`);
    console.log(`  Status: ${loginPageRes.status}`);
    if (loginPageRes.status === 200) {
      console.log('  [PASS] /login page is live and accessible');
    } else {
      throw new Error('/login page route failed');
    }

  } finally {
    // Cleanup
    await prisma.employee.delete({ where: { id: testUser.id } });
    await prisma.$disconnect();
    console.log('\nCleaned up test employee.');
  }

  console.log('\n=== ALL LOGIN & AUTHENTICATION FLOW TESTS PASSED ===');
}

testLoginFlow().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
