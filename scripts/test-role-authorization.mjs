// scripts/test-role-authorization.mjs
// Automated verification of role-based authorization for Admin, Manager, and Employee

const BASE_URL = 'http://localhost:3000';

const USERS = {
  admin: { email: 'admin@suchiigroup.com', password: 'admin123', expectedRole: 'A' },
  manager: { email: 'vikram.singh@suchiigroup.com', password: 'user123', expectedRole: 'M' },
  employee: { email: 'ananya.roy@suchiigroup.com', password: 'user123', expectedRole: 'E' }
};

async function login(creds) {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: creds.email, password: creds.password })
  });
  
  if (!res.ok) {
    throw new Error(`Login failed for ${creds.email}: ${res.status} ${await res.text()}`);
  }
  
  const data = await res.json();
  const token = data.token;
  
  return {
    token,
    cookie: `auth_token=${token}`,
    user: data.employee || data.user
  };
}

async function apiRequest(endpoint, options = {}, session = null) {
  const token = session?.token;
  const cookie = session?.cookie;
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(cookie ? { Cookie: cookie } : {}),
    ...(options.headers || {})
  };
  
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers
  });
  
  let json = null;
  try {
    json = await res.json();
  } catch (e) {
    // not JSON
  }
  
  const payload = json && json.data !== undefined ? json.data : json;
  return { status: res.status, data: payload, raw: json };
}

async function runTests() {
  console.log('=====================================================');
  console.log('STARTING ROLE-BASED AUTHORIZATION VERIFICATION SUITE');
  console.log('=====================================================\n');
  
  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✅ PASS: ${message}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${message}`);
      failed++;
    }
  }

  // 1. Authenticate all three roles
  console.log('1. Authenticating test users...');
  const sessions = {};
  for (const [key, creds] of Object.entries(USERS)) {
    try {
      sessions[key] = await login(creds);
      console.log(`  ✓ Logged in as ${key.toUpperCase()} (${sessions[key].user.email}, Role: ${sessions[key].user.role})`);
    } catch (err) {
      console.error(`  ❌ Failed to log in as ${key}:`, err.message);
      process.exit(1);
    }
  }

  const { admin, manager, employee } = sessions;

  // 2. Unauthenticated check
  console.log('\n2. Testing unauthenticated access (no cookies)...');
  {
    const res = await apiRequest('/api/projects');
    assert(res.status === 401, `GET /api/projects without auth returns 401 (got ${res.status})`);
  }
  {
    const res = await apiRequest('/api/reports');
    assert(res.status === 401, `GET /api/reports without auth returns 401 (got ${res.status})`);
  }

  // 3. Employee (E) Restricted Endpoints
  console.log('\n3. Testing Employee (E) Forbidden Access to Enterprise Modules (Expected: 403)...');
  const enterpriseEndpoints = [
    { method: 'GET', url: '/api/projects', name: 'Projects' },
    { method: 'GET', url: '/api/contractors', name: 'Contractors' },
    { method: 'GET', url: '/api/sites', name: 'Sites' },
    { method: 'GET', url: '/api/boqs', name: 'BOQs' },
    { method: 'GET', url: '/api/departments', name: 'Departments' },
    { method: 'GET', url: '/api/designations', name: 'Designations' },
    { method: 'GET', url: '/api/reports', name: 'Reports' },
    { method: 'GET', url: '/api/employees', name: 'Employee List' },
  ];

  for (const ep of enterpriseEndpoints) {
    const res = await apiRequest(ep.url, { method: ep.method }, employee);
    assert(res.status === 403, `Employee blocked from ${ep.name} (${ep.method} ${ep.url}) with 403 (got ${res.status})`);
  }

  // 4. Employee (E) Self-Service Endpoints
  console.log('\n4. Testing Employee (E) Self-Service Endpoints...');
  {
    // Profile
    const res = await apiRequest(`/api/employees/${employee.user.id}`, { method: 'GET' }, employee);
    assert(res.status === 200, `Employee can view own profile (GET /api/employees/${employee.user.id}) -> 200`);
    assert(res.data?.id === employee.user.id, `Profile returned matches employee id`);
  }
  {
    // Prevent Employee from viewing another employee's profile
    const res = await apiRequest(`/api/employees/${manager.user.id}`, { method: 'GET' }, employee);
    assert(res.status === 403, `Employee blocked from viewing other employee's profile -> 403 (got ${res.status})`);
  }
  {
    // Employee Attendance Scoping
    const res = await apiRequest(`/api/attendance`, { method: 'GET' }, employee);
    assert(res.status === 200, `Employee can fetch attendance -> 200`);
    const allBelongToSelf = Array.isArray(res.data) && res.data.every(r => r.employeeId === employee.user.id);
    assert(allBelongToSelf, `All attendance records strictly belong to employee ${employee.user.id}`);
  }
  {
    // Employee Dashboard personal scoped metrics
    const res = await apiRequest(`/api/dashboard`, { method: 'GET' }, employee);
    assert(res.status === 200, `Employee dashboard loaded -> 200`);
    assert(res.data?.isEmployee === true && res.data?.currentUser?.role === 'E', `Dashboard response scoped for role E`);
    assert(res.data?.recentLeaves !== undefined && res.data?.kpis !== undefined, `Dashboard contains personal leaves and KPIs`);
  }
  {
    // Employee attempting to create/check-in attendance for someone else
    const res = await apiRequest(`/api/attendance`, {
      method: 'POST',
      body: JSON.stringify({
        employeeId: manager.user.id, // Someone else!
        date: new Date().toISOString().split('T')[0],
        checkIn: new Date().toISOString()
      })
    }, employee);
    assert(res.status === 403, `Employee blocked from clocking in for another employee -> 403 (got ${res.status})`);
  }

  // 5. Manager (M) Access & Restrictions
  console.log('\n5. Testing Manager (M) Enterprise Access & Specific Restrictions...');
  {
    // Manager access to Projects, Contractors, Sites, BOQs, Reports, Employees
    const allowedForManager = [
      { url: '/api/projects', name: 'Projects' },
      { url: '/api/contractors', name: 'Contractors' },
      { url: '/api/sites', name: 'Sites' },
      { url: '/api/boqs', name: 'BOQs' },
      { url: '/api/reports', name: 'Reports' },
      { url: '/api/employees', name: 'Employees List' },
      { url: '/api/departments', name: 'Departments Read' },
      { url: '/api/designations', name: 'Designations Read' },
    ];
    for (const item of allowedForManager) {
      const res = await apiRequest(item.url, { method: 'GET' }, manager);
      assert(res.status === 200, `Manager can access ${item.name} (${item.url}) -> 200`);
    }
  }
  {
    // Manager RESTRICTED from creating/updating/deleting Departments
    const res = await apiRequest('/api/departments', {
      method: 'POST',
      body: JSON.stringify({ name: 'Unauthorized Dept', code: 'UNAUTH' })
    }, manager);
    assert(res.status === 403, `Manager blocked from POST /api/departments -> 403 (got ${res.status})`);
  }
  {
    // Manager RESTRICTED from creating/updating/deleting Designations
    const res = await apiRequest('/api/designations', {
      method: 'POST',
      body: JSON.stringify({ title: 'Unauthorized Title', code: 'UNAUTH' })
    }, manager);
    assert(res.status === 403, `Manager blocked from POST /api/designations -> 403 (got ${res.status})`);
  }
  {
    // Manager RESTRICTED from deleting employees
    const res = await apiRequest(`/api/employees/${employee.user.id}`, {
      method: 'DELETE'
    }, manager);
    assert(res.status === 403, `Manager blocked from DELETE /api/employees/[id] -> 403 (got ${res.status})`);
  }
  {
    // Manager RESTRICTED from creating an employee with role 'A' (Admin)
    const res = await apiRequest('/api/employees', {
      method: 'POST',
      body: JSON.stringify({
        firstName: 'Hacker',
        lastName: 'Admin',
        email: 'hacker.admin@suchiigroup.com',
        phone: '9999999999',
        password: 'password123',
        role: 'A', // Forbidden for manager
        joiningDate: new Date().toISOString()
      })
    }, manager);
    assert(res.status === 403, `Manager blocked from creating Admin role 'A' -> 403 (got ${res.status})`);
  }

  // 6. Admin (A) Full Permissions
  console.log('\n6. Testing Admin (A) Full Access...');
  {
    const adminEndpoints = [
      '/api/projects',
      '/api/contractors',
      '/api/sites',
      '/api/boqs',
      '/api/reports',
      '/api/employees',
      '/api/departments',
      '/api/designations',
      '/api/dashboard'
    ];
    for (const url of adminEndpoints) {
      const res = await apiRequest(url, { method: 'GET' }, admin);
      assert(res.status === 200, `Admin has full access to ${url} -> 200`);
    }
  }

  console.log('\n=====================================================');
  console.log(`VERIFICATION SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('=====================================================');
  
  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
