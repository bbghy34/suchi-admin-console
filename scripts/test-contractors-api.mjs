import assert from 'assert';

const BASE_URL = 'http://localhost:3000';

async function runTests() {
  console.log('--- Starting Contractor API Integration Tests ---');

  // 1. Login as Admin
  console.log('1. Logging in as Admin...');
  const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'admin@suchiigroup.com',
      password: 'admin123',
    }),
  });

  const loginData = await loginRes.json();
  assert.strictEqual(loginRes.status, 200, 'Admin login failed');
  assert.strictEqual(loginData.success, true);
  const adminToken = loginData.token;
  console.log('✓ Admin authenticated successfully.');

  // 2. Login as Staff
  console.log('2. Logging in as Staff (Role E)...');
  const staffLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'ananya.roy@suchiigroup.com',
      password: 'user123',
    }),
  });
  const staffData = await staffLoginRes.json();
  assert.strictEqual(staffLoginRes.status, 200, 'Staff login failed');
  const staffToken = staffData.token;
  console.log('✓ Staff authenticated successfully.');

  // 3. Unauthorized request check
  console.log('3. Checking unauthorized GET /api/contractors...');
  const unauthRes = await fetch(`${BASE_URL}/api/contractors`);
  assert.strictEqual(unauthRes.status, 401, 'Expected 401 for unauthenticated request');
  console.log('✓ Unauthenticated request blocked with 401.');

  // 4. POST /api/contractors validation
  console.log('4. Testing POST /api/contractors validation...');
  const emptyNameRes = await fetch(`${BASE_URL}/api/contractors`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({ name: '   ' }),
  });
  assert.strictEqual(emptyNameRes.status, 400, 'Expected 400 for empty name');
  console.log('✓ Empty name validation passed.');

  // Create contractor 1
  const testContractorName = `Oceanic Heavy Dredging Ltd ${Date.now()}`;
  const createRes = await fetch(`${BASE_URL}/api/contractors`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({
      name: testContractorName,
      phoneNo: '+91 99887 76655',
      description: 'Specialized marine piling and cutter-suction dredging partner.',
    }),
  });

  const createData = await createRes.json();
  assert.strictEqual(createRes.status, 201, 'Failed to create contractor');
  assert.strictEqual(createData.success, true);
  assert.strictEqual(createData.data.name, testContractorName);
  assert.strictEqual(createData.data.projectCount, 0);
  const contractorId = createData.data.id;
  console.log('✓ Contractor created successfully:', contractorId);

  // Duplicate name check
  const dupRes = await fetch(`${BASE_URL}/api/contractors`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({
      name: testContractorName,
    }),
  });
  assert.strictEqual(dupRes.status, 400, 'Expected 400 for duplicate contractor name');
  console.log('✓ Duplicate contractor name rejected.');

  // 5. GET /api/contractors with pagination & search
  console.log('5. Testing GET /api/contractors...');
  const listRes = await fetch(`${BASE_URL}/api/contractors?page=1&limit=10&search=${encodeURIComponent(testContractorName)}`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const listData = await listRes.json();
  assert.strictEqual(listRes.status, 200);
  assert.strictEqual(listData.success, true);
  assert.ok(listData.pagination, 'Pagination metadata missing');
  assert.ok(listData.data.length >= 1, 'Contractor should be in search results');
  assert.strictEqual(listData.data[0].id, contractorId);
  assert.strictEqual(typeof listData.data[0].projectCount, 'number');
  console.log('✓ GET /api/contractors list and pagination verified.');

  // 6. GET /api/contractors/[id]
  console.log('6. Testing GET /api/contractors/[id]...');
  const getOneRes = await fetch(`${BASE_URL}/api/contractors/${contractorId}`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const getOneData = await getOneRes.json();
  assert.strictEqual(getOneRes.status, 200);
  assert.strictEqual(getOneData.data.id, contractorId);
  assert.ok(Array.isArray(getOneData.data.projects), 'Projects array should be present');
  console.log('✓ GET /api/contractors/[id] verified.');

  // 7. PUT /api/contractors/[id]
  console.log('7. Testing PUT /api/contractors/[id]...');
  const updatedName = `${testContractorName} - Updated`;
  const updateRes = await fetch(`${BASE_URL}/api/contractors/${contractorId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({
      name: updatedName,
      phoneNo: '+91 99887 00000',
      description: 'Updated partner description.',
    }),
  });
  const updateData = await updateRes.json();
  assert.strictEqual(updateRes.status, 200);
  assert.strictEqual(updateData.data.name, updatedName);
  assert.strictEqual(updateData.data.phoneNo, '+91 99887 00000');
  console.log('✓ PUT /api/contractors/[id] updated successfully.');

  // 8. Test DELETE protection when assigned to a Project
  console.log('8. Testing Project foreign key deletion protection (Project.contractor -> Contractor.id)...');
  
  // Assign a test project to this contractor via Prisma directly
  const { default: prisma } = await import('../lib/prisma.js');
  const testProject = await prisma.project.create({
    data: {
      name: `Tender Project Test - ${Date.now()}`,
      contractor: contractorId, // Relationship: Project.contractor -> Contractor.id
      status: 'PLANNING',
    },
  });
  console.log('  Created linked project:', testProject.id, 'with contractor:', testProject.contractor);

  // Attempt to delete contractor while assigned to project
  const protectedDeleteRes = await fetch(`${BASE_URL}/api/contractors/${contractorId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const protectedDeleteData = await protectedDeleteRes.json();
  assert.strictEqual(protectedDeleteRes.status, 400, 'Expected 400 when contractor has assigned projects');
  assert.strictEqual(
    protectedDeleteData.message,
    'Cannot delete contractor because it is assigned to one or more projects.',
    'Unexpected error message'
  );
  console.log('✓ Protected against deletion when assigned to project:', protectedDeleteData.message);

  // 9. Role restriction check: Staff should NOT be able to delete
  console.log('9. Checking role restriction on DELETE (Admin only)...');
  const staffDeleteRes = await fetch(`${BASE_URL}/api/contractors/${contractorId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${staffToken}` },
  });
  assert.strictEqual(staffDeleteRes.status, 403, 'Expected 403 for non-admin user');
  console.log('✓ Staff user forbidden from deleting contractor (403).');

  // 10. Clean up project and perform successful Admin delete
  console.log('10. Unlinking project and verifying successful deletion...');
  await prisma.project.delete({ where: { id: testProject.id } });

  const finalDeleteRes = await fetch(`${BASE_URL}/api/contractors/${contractorId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const finalDeleteData = await finalDeleteRes.json();
  assert.strictEqual(finalDeleteRes.status, 200);
  assert.strictEqual(finalDeleteData.success, true);
  console.log('✓ Contractor deleted successfully after project unlinked.');

  // Verify 404 after deletion
  const checkDeletedRes = await fetch(`${BASE_URL}/api/contractors/${contractorId}`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert.strictEqual(checkDeletedRes.status, 404);
  console.log('✓ Contractor confirmed non-existent (404).');

  console.log('\n--- ALL 10 CONTRACTOR API TESTS PASSED SUCCESSFULLY! ---');
  process.exit(0);
}

runTests().catch((err) => {
  console.error('Test failed with error:', err);
  process.exit(1);
});
