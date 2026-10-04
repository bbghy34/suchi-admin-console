// scripts/test-error-handling.mjs
// Comprehensive test suite verifying consistent HTTP error handling (400, 401, 403, 404, 409, 500)
// and strict secret leak prevention (no passwordHash, JWT secret, DB URLs, or internal stack traces).

const BASE_URL = 'http://localhost:3000';

const USERS = {
  admin: { email: 'admin@suchiigroup.com', password: 'admin123', role: 'A' },
  manager: { email: 'vikram.singh@suchiigroup.com', password: 'user123', role: 'M' },
  employee: { email: 'ananya.roy@suchiigroup.com', password: 'user123', role: 'E' },
};

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ PASS: ${message}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    failed++;
  }
}

async function login(creds) {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: creds.email, password: creds.password }),
  });

  const json = await res.json().catch(() => null);
  return {
    status: res.status,
    token: json?.token || json?.data?.token,
    user: json?.employee || json?.data?.employee,
    raw: json,
  };
}

async function request(endpoint, options = {}, token = null) {
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };

  const res = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  const json = await res.json().catch(() => null);
  return { status: res.status, data: json };
}

async function runErrorHandlingTests() {
  console.log('================================================================');
  console.log('SUCHII GROUP OPERATIONS CONSOLE - ERROR HANDLING & SECURITY TEST SUITE');
  console.log('================================================================\n');

  // 1. Authenticate Sessions
  console.log('[Phase 1] Establishing Test User Sessions...');
  const adminSession = await login(USERS.admin);
  const managerSession = await login(USERS.manager);
  const employeeSession = await login(USERS.employee);

  assert(adminSession.status === 200 && adminSession.token, 'Admin login succeeded');
  assert(managerSession.status === 200 && managerSession.token, 'Manager login succeeded');
  assert(employeeSession.status === 200 && employeeSession.token, 'Employee login succeeded');

  // 2. Test 401 Unauthorized
  console.log('\n[Phase 2] Testing 401 Unauthorized Enforcement...');
  const noAuthProjects = await request('/api/projects');
  assert(noAuthProjects.status === 401, 'Unauthenticated GET /api/projects returns 401 Unauthorized');
  assert(noAuthProjects.data?.success === false, '401 response has { success: false }');
  assert(typeof noAuthProjects.data?.message === 'string', '401 response has descriptive message');

  const noAuthAttendance = await request('/api/attendance');
  assert(noAuthAttendance.status === 401, 'Unauthenticated GET /api/attendance returns 401 Unauthorized');

  const noAuthLeaves = await request('/api/leaves');
  assert(noAuthLeaves.status === 401, 'Unauthenticated GET /api/leaves returns 401 Unauthorized');

  const invalidToken = await request('/api/projects', {}, 'INVALID_BEARER_TOKEN_HERE');
  assert(invalidToken.status === 401, 'Invalid Bearer token returns 401 Unauthorized');

  // 3. Test 403 Forbidden
  console.log('\n[Phase 3] Testing 403 Forbidden Role Enforcement...');
  const empCreateDept = await request('/api/departments', {
    method: 'POST',
    body: JSON.stringify({ name: 'Unauthorized Dept' }),
  }, employeeSession.token);
  assert(empCreateDept.status === 403, 'Employee POST /api/departments returns 403 Forbidden');
  assert(empCreateDept.data?.success === false, '403 response has { success: false }');

  const empCreateProject = await request('/api/projects', {
    method: 'POST',
    body: JSON.stringify({ name: 'Unauthorized Project' }),
  }, employeeSession.token);
  assert(empCreateProject.status === 403, 'Employee POST /api/projects returns 403 Forbidden');

  const empReports = await request('/api/reports', {}, employeeSession.token);
  assert(empReports.status === 403, 'Employee GET /api/reports returns 403 Forbidden');

  // 4. Test 400 Bad Request & Input Validation
  console.log('\n[Phase 4] Testing 400 Bad Request & Form Input Validation...');
  const emptyProject = await request('/api/projects', {
    method: 'POST',
    body: JSON.stringify({}),
  }, adminSession.token);
  assert(emptyProject.status === 400, 'POST /api/projects with empty body returns 400 Bad Request');
  assert(emptyProject.data?.success === false, '400 response has { success: false }');
  assert(Boolean(emptyProject.data?.message), '400 response includes descriptive validation message');

  const emptyContractor = await request('/api/contractors', {
    method: 'POST',
    body: JSON.stringify({ name: '   ' }),
  }, adminSession.token);
  assert(emptyContractor.status === 400, 'POST /api/contractors with blank name returns 400 Bad Request');

  const emptyLeave = await request('/api/leaves', {
    method: 'POST',
    body: JSON.stringify({ reason: '' }),
  }, employeeSession.token);
  assert(emptyLeave.status === 400, 'POST /api/leaves with blank reason returns 400 Bad Request');

  const invalidDateFormat = await request('/api/leaves', {
    method: 'POST',
    body: JSON.stringify({ reason: 'Vacation', leaveDate: 'not-a-date' }),
  }, employeeSession.token);
  assert(invalidDateFormat.status === 400, 'POST /api/leaves with invalid date returns 400 Bad Request');

  // 5. Test 404 Not Found
  console.log('\n[Phase 5] Testing 404 Not Found...');
  const missingProject = await request('/api/projects/cld_nonexistent_proj_9999', {}, adminSession.token);
  assert(missingProject.status === 404, 'GET /api/projects/[invalid_id] returns 404 Not Found');
  assert(missingProject.data?.success === false, '404 response has { success: false }');

  const missingContractor = await request('/api/contractors/cld_nonexistent_cont_9999', {}, adminSession.token);
  assert(missingContractor.status === 404, 'GET /api/contractors/[invalid_id] returns 404 Not Found');

  const missingLeave = await request('/api/leaves/cld_nonexistent_leave_9999', {}, adminSession.token);
  assert(missingLeave.status === 404, 'GET /api/leaves/[invalid_id] returns 404 Not Found');

  const missingAttendance = await request('/api/attendance/cld_nonexistent_att_9999', {}, adminSession.token);
  assert(missingAttendance.status === 404, 'GET /api/attendance/[invalid_id] returns 404 Not Found');

  // 6. Test 409 Conflict (Duplicate Unique Fields)
  console.log('\n[Phase 6] Testing 409 Conflict Handling...');
  // Create test contractor first
  const testContName = `Audit Test Contractor ${Date.now()}`;
  const firstCont = await request('/api/contractors', {
    method: 'POST',
    body: JSON.stringify({ name: testContName }),
  }, adminSession.token);
  assert(firstCont.status === 201, 'Created first test contractor successfully');

  // Attempt duplicate contractor name
  const duplicateCont = await request('/api/contractors', {
    method: 'POST',
    body: JSON.stringify({ name: testContName }),
  }, adminSession.token);
  assert(duplicateCont.status === 409, `Duplicate contractor name returned 409 Conflict (Got status ${duplicateCont.status})`);
  assert(duplicateCont.data?.success === false, '409 response has { success: false }');

  // Clean up test contractor
  if (firstCont.data?.data?.id) {
    await request(`/api/contractors/${firstCont.data.data.id}`, { method: 'DELETE' }, adminSession.token);
  }

  // 7. Test Security Boundaries & Secret Sanitization
  console.log('\n[Phase 7] Testing Security Boundaries & Information Leak Prevention...');
  const jsonStrAdmin = JSON.stringify(adminSession.raw);
  assert(!jsonStrAdmin.includes('passwordHash'), 'Login payload does NOT leak passwordHash');
  assert(!jsonStrAdmin.includes('JWT_SECRET'), 'Login payload does NOT leak JWT_SECRET');

  const empList = await request('/api/employees?limit=5', {}, adminSession.token);
  const jsonStrEmps = JSON.stringify(empList.data);
  assert(!jsonStrEmps.includes('passwordHash'), 'Employee list query does NOT leak passwordHash');
  assert(!jsonStrEmps.includes('DATABASE_URL'), 'Employee list query does NOT leak DATABASE_URL');

  // Verify that error responses do not contain stack traces
  const errPayload = JSON.stringify(missingProject.data);
  assert(!errPayload.includes('stack'), 'Error response does not contain stack traces');
  assert(!errPayload.includes('prisma'), 'Error response does not expose internal prisma internals');

  console.log('\n================================================================');
  console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runErrorHandlingTests().catch((err) => {
  console.error('Unhandled test execution error:', err);
  process.exit(1);
});
