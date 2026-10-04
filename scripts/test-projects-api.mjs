import assert from 'assert';

const BASE_URL = 'http://localhost:3000';

async function runTests() {
  console.log('--- Starting Project Management API Integration Tests ---');

  // 1. Authenticate Admin and Staff
  console.log('1. Authenticating users...');
  const [adminRes, staffRes] = await Promise.all([
    fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@suchiigroup.com', password: 'admin123' }),
    }),
    fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'ananya.roy@suchiigroup.com', password: 'user123' }),
    }),
  ]);

  const adminData = await adminRes.json();
  const staffData = await staffRes.json();
  assert.strictEqual(adminRes.status, 200, 'Admin login failed');
  assert.strictEqual(staffRes.status, 200, 'Staff login failed');
  const adminToken = adminData.token;
  const staffToken = staffData.token;
  const adminEmployeeId = adminData.employee.id;
  console.log('✓ Admin (A) and Staff (E) authenticated.');

  // 2. Fetch existing Department and Contractor to use in tests
  console.log('2. Fetching Department and Contractor fixtures...');
  const [deptRes, contRes] = await Promise.all([
    fetch(`${BASE_URL}/api/departments`, { headers: { Authorization: `Bearer ${adminToken}` } }),
    fetch(`${BASE_URL}/api/contractors`, { headers: { Authorization: `Bearer ${adminToken}` } }),
  ]);

  const deptData = await deptRes.json();
  const contData = await contRes.json();
  assert.strictEqual(deptRes.status, 200);
  assert.strictEqual(contRes.status, 200);

  const testDept = deptData.data[0];
  assert.ok(testDept, 'At least one department should exist');

  let testContractor = contData.data[0];
  if (!testContractor) {
    // Create one if none exist
    const newContRes = await fetch(`${BASE_URL}/api/contractors`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ name: `Marine Works Corp ${Date.now()}` }),
    });
    const newContData = await newContRes.json();
    testContractor = newContData.data;
  }
  assert.ok(testContractor, 'Contractor should exist');
  console.log('  Using Department:', testDept.name, `(${testDept.id})`);
  console.log('  Using Contractor:', testContractor.name, `(${testContractor.id})`);

  // 3. Unauthorized request check
  console.log('3. Checking unauthorized GET /api/projects...');
  const unauthRes = await fetch(`${BASE_URL}/api/projects`);
  assert.strictEqual(unauthRes.status, 401, 'Expected 401 for unauthenticated request');
  console.log('✓ Unauthenticated request blocked with 401.');

  // 4. POST Validation Tests
  console.log('4. Testing POST validation rules...');

  // 4a. Missing required fields
  const missingRes = await fetch(`${BASE_URL}/api/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ name: 'Incomplete Project' }),
  });
  assert.strictEqual(missingRes.status, 400);
  console.log('✓ Missing required fields rejected.');

  // 4b. Invalid department
  const badDeptRes = await fetch(`${BASE_URL}/api/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({
      name: 'Project Bad Dept',
      department: '00000000-0000-0000-0000-000000000000',
      startDate: '2026-01-01',
      endDate: '2026-12-31',
    }),
  });
  assert.strictEqual(badDeptRes.status, 400);
  console.log('✓ Non-existent department rejected.');

  // 4c. CRITICAL: Employee ID used as Contractor MUST BE REJECTED
  console.log('  Checking Employee ID passed as contractor (MUST be rejected)...');
  const empAsContRes = await fetch(`${BASE_URL}/api/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({
      name: 'Project Invalid Contractor',
      department: testDept.id,
      contractor: adminEmployeeId, // Employee ID passed as contractor!
      startDate: '2026-01-01',
      endDate: '2026-12-31',
    }),
  });
  assert.strictEqual(empAsContRes.status, 400);
  const empAsContData = await empAsContRes.json();
  assert.ok(empAsContData.message.includes('Contractor must reference a valid Contractor.id'));
  console.log('✓ Employee ID as Contractor strictly rejected with 400.');

  // 4d. Date validation: startDate >= endDate
  const badDatesRes = await fetch(`${BASE_URL}/api/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({
      name: 'Project Bad Dates',
      department: testDept.id,
      startDate: '2026-12-31',
      endDate: '2026-01-01',
    }),
  });
  assert.strictEqual(badDatesRes.status, 400);
  console.log('✓ Inverted dates (startDate >= endDate) rejected.');

  // 4e. Progress validation: progress > 100
  const badProgRes = await fetch(`${BASE_URL}/api/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({
      name: 'Project Bad Progress',
      department: testDept.id,
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      progress: 150,
    }),
  });
  assert.strictEqual(badProgRes.status, 400);
  console.log('✓ Out-of-bounds progress (> 100) rejected.');

  // 5. Successful Project Creation (POST /api/projects)
  console.log('5. Creating valid Project with Department and Contractor...');
  const projectName = `Dredging Berth Expansion ${Date.now()}`;
  const createRes = await fetch(`${BASE_URL}/api/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({
      name: projectName,
      description: 'Capital deepening and approach channel harbor dredging.',
      department: testDept.id,
      contractor: testContractor.id,
      type: 'Marine Dredging',
      status: 'ACTIVE',
      progress: 25,
      tenderId: 'TND-2026-089',
      budget: 15000000,
      startDate: '2026-03-01',
      endDate: '2027-03-01',
    }),
  });

  const createData = await createRes.json();
  assert.strictEqual(createRes.status, 201, 'Project creation failed');
  assert.strictEqual(createData.success, true);
  const projectId = createData.data.id;
  assert.strictEqual(createData.data.name, projectName);
  assert.strictEqual(createData.data.departmentId, testDept.id);
  assert.strictEqual(createData.data.contractorId, testContractor.id);
  assert.strictEqual(createData.data.contractorRel?.id, testContractor.id);
  console.log('✓ Project created successfully:', projectId);

  // 6. GET /api/projects with Filters and Pagination
  console.log('6. Testing GET /api/projects with filters & pagination...');
  const queryUrl = `${BASE_URL}/api/projects?page=1&limit=10&status=ACTIVE&department=${testDept.id}&contractor=${testContractor.id}&type=Marine+Dredging&search=${encodeURIComponent(projectName)}`;
  const getListRes = await fetch(queryUrl, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const getListData = await getListRes.json();
  assert.strictEqual(getListRes.status, 200);
  assert.strictEqual(getListData.success, true);
  assert.ok(getListData.pagination, 'Pagination metadata missing');
  assert.ok(getListData.data.length >= 1, 'Created project not found in filtered search');
  const fetchedProj = getListData.data[0];
  assert.strictEqual(fetchedProj.id, projectId);
  assert.ok(fetchedProj.departmentRel, 'Department relation missing');
  assert.ok(fetchedProj.contractorRel, 'Contractor relation missing');
  assert.strictEqual(fetchedProj.contractorRel.id, testContractor.id);
  assert.ok(Array.isArray(fetchedProj.sites), 'Sites array missing');
  assert.ok(Array.isArray(fetchedProj.boqRecords), 'BOQs array missing');
  console.log('✓ GET /api/projects returned Project, Department, Contractor, Sites, BOQs.');

  // 7. GET /api/projects/[id]
  console.log('7. Testing GET /api/projects/[id]...');
  const getOneRes = await fetch(`${BASE_URL}/api/projects/${projectId}`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const getOneData = await getOneRes.json();
  assert.strictEqual(getOneRes.status, 200);
  assert.strictEqual(getOneData.data.id, projectId);
  assert.strictEqual(getOneData.data.contractorRel.name, testContractor.name);
  console.log('✓ GET /api/projects/[id] verified with contractor relation.');

  // 8. PUT /api/projects/[id]
  console.log('8. Testing PUT /api/projects/[id]...');
  const updateRes = await fetch(`${BASE_URL}/api/projects/${projectId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({
      progress: 60,
      status: 'IN_PROGRESS',
      budget: 16500000,
    }),
  });
  const updateData = await updateRes.json();
  assert.strictEqual(updateRes.status, 200);
  assert.strictEqual(updateData.data.progress, 60);
  assert.strictEqual(updateData.data.status, 'IN_PROGRESS');
  assert.strictEqual(updateData.data.budget, 16500000);
  console.log('✓ PUT /api/projects/[id] updated successfully.');

  // 9. DELETE Role Guard Check (Staff role E should be 403)
  console.log('9. Checking DELETE role protection (Admin/Manager only)...');
  const staffDelRes = await fetch(`${BASE_URL}/api/projects/${projectId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${staffToken}` },
  });
  assert.strictEqual(staffDelRes.status, 403, 'Staff should be forbidden (403)');
  console.log('✓ Staff user forbidden from deleting project (403).');

  // 10. DELETE with active dependency check
  console.log('10. Testing DELETE dependency protection...');
  const { default: prisma } = await import('../lib/prisma.js');

  // Attach a site to this project to simulate active dependency
  const testSite = await prisma.site.create({
    data: {
      name: `Site Attachment Test ${Date.now()}`,
      projectId: projectId,
    },
  });
  console.log('  Attached test site to project:', testSite.id);

  // Attempt delete without confirmation
  const depDelRes = await fetch(`${BASE_URL}/api/projects/${projectId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert.strictEqual(depDelRes.status, 400, 'Expected 400 when project has active dependencies');
  const depDelData = await depDelRes.json();
  assert.ok(depDelData.message.includes('Project has active dependencies'));
  console.log('✓ Non-cascading deletion prevented without confirmation:', depDelData.message);

  // Attempt delete WITH confirmation (?confirm=true)
  console.log('  Attempting delete with confirmation parameter (?confirm=true)...');
  const confDelRes = await fetch(`${BASE_URL}/api/projects/${projectId}?confirm=true`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const confDelData = await confDelRes.json();
  assert.strictEqual(confDelRes.status, 200);
  assert.strictEqual(confDelData.success, true);
  console.log('✓ Project deleted safely with confirmed parameter.');

  // Clean up site
  await prisma.site.delete({ where: { id: testSite.id } });

  // Verify project is gone
  const checkRes = await fetch(`${BASE_URL}/api/projects/${projectId}`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert.strictEqual(checkRes.status, 404);
  console.log('✓ Project confirmed deleted (404).');

  console.log('\n--- ALL 10 PROJECT API INTEGRATION TESTS PASSED! ---');
  process.exit(0);
}

runTests().catch((err) => {
  console.error('Test error:', err);
  process.exit(1);
});
