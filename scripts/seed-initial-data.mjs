import prisma from '../lib/prisma.js';
import { hashPassword } from '../lib/auth.js';

async function main() {
  console.log('Seeding initial system data...');

  // Helper for department
  async function getOrCreateDept(name, description) {
    let d = await prisma.department.findFirst({ where: { name } });
    if (!d) {
      d = await prisma.department.create({ data: { name, description } });
    }
    return d;
  }

  // Helper for designation
  async function getOrCreateDesig(title, description) {
    let des = await prisma.designation.findFirst({ where: { title } });
    if (!des) {
      des = await prisma.designation.create({ data: { title, description } });
    }
    return des;
  }

  // 1. Departments
  const dept1 = await getOrCreateDept(
    'Marine & Dredging Operations',
    'Harbor engineering, dredging logistics, vessel maintenance, and marine infrastructure.'
  );
  const dept2 = await getOrCreateDept(
    'Civil Engineering & Construction',
    'Piling, jetty construction, breakwaters, and coastal defense structures.'
  );
  const dept3 = await getOrCreateDept(
    'Tender & Estimation Division',
    'Bidding, contract analysis, BOQ estimation, and compliance documentation.'
  );
  const dept4 = await getOrCreateDept(
    'Human Resources & Administration',
    'Personnel recruitment, organizational governance, payroll, and site safety compliance.'
  );

  // 2. Designations
  const desig1 = await getOrCreateDesig(
    'Managing Director',
    'Executive corporate leadership, strategic growth, and government tender approvals.'
  );
  const desig2 = await getOrCreateDesig(
    'Project Director',
    'Overall executive oversight of harbor and marine engineering projects.'
  );
  const desig3 = await getOrCreateDesig(
    'Chief Marine Engineer',
    'Lead technical architect for dredging machinery, vessels, and barge logistics.'
  );
  const desig4 = await getOrCreateDesig(
    'Senior Tender Specialist',
    'Specialist for high-value port tender bids, pricing, and contractor evaluations.'
  );
  const desig5 = await getOrCreateDesig(
    'Site Operations Manager',
    'On-site execution, staff allocation, and daily field safety reporting.'
  );

  // 3. Site
  let site1 = await prisma.site.findFirst({
    where: { name: 'Paradip Port Marine Terminal' },
  });

  if (!site1) {
    site1 = await prisma.site.create({
      data: {
        name: 'Paradip Port Marine Terminal',
        address: 'Berth 4, Paradip Harbor, Odisha 754142',
        coordinates: '20.2644, 86.6853',
        status: 'ACTIVE',
      },
    });
  }

  // 4. Employees
  const adminPasswordHash = await hashPassword('admin123');
  const userPasswordHash = await hashPassword('user123');

  // Helper for employee
  async function getOrCreateEmployee(data) {
    let emp = await prisma.employee.findFirst({
      where: { email: data.email },
    });
    if (!emp) {
      emp = await prisma.employee.create({ data });
    } else {
      emp = await prisma.employee.update({
        where: { id: emp.id },
        data,
      });
    }
    return emp;
  }

  // Admin
  const admin = await getOrCreateEmployee({
    employeeCode: 'SG-001',
    name: 'Suchii Administrator',
    email: 'admin@suchiigroup.com',
    passwordHash: adminPasswordHash,
    role: 'A',
    status: 'true',
    deptId: dept4.id,
    designationId: desig1.id,
    phone: '+91 98765 43210',
    joinDate: new Date('2023-01-15'),
    gender: 'Male',
    dob: new Date('1985-06-20'),
    address: 'Suchii Group Corporate Towers, Marine Drive, Mumbai',
    pan: 'ABCDE1234F',
    aadhar: '123456789012',
    uan: '100987654321',
    bankDetails: 'HDFC Bank - A/C 50100234567890 - HDFC0000123',
    emergencyNo: '+91 98765 00000',
  });

  // Manager
  const manager = await getOrCreateEmployee({
    employeeCode: 'SG-002',
    name: 'Vikram Singh',
    email: 'vikram.singh@suchiigroup.com',
    passwordHash: userPasswordHash,
    role: 'M',
    status: 'true',
    deptId: dept1.id,
    designationId: desig3.id,
    siteId: site1.id,
    phone: '+91 98111 22334',
    joinDate: new Date('2023-05-10'),
    gender: 'Male',
    dob: new Date('1988-11-12'),
    address: 'B-402 Seagull Apartments, Paradip Port Road, Odisha',
    pan: 'BKFPS8821K',
    aadhar: '987654321098',
    uan: '100876543210',
    bankDetails: 'State Bank of India - A/C 20455678901 - SBIN0001234',
    emergencyNo: '+91 98111 99887',
  });

  // Tender Specialist Staff
  const staff = await getOrCreateEmployee({
    employeeCode: 'SG-003',
    name: 'Ananya Roy',
    email: 'ananya.roy@suchiigroup.com',
    passwordHash: userPasswordHash,
    role: 'E',
    status: 'true',
    deptId: dept3.id,
    designationId: desig4.id,
    phone: '+91 97234 56789',
    joinDate: new Date('2024-02-01'),
    gender: 'Female',
    dob: new Date('1994-04-18'),
    address: 'Tower 3, Salt Lake Sector V, Kolkata, West Bengal',
    pan: 'AROPR4432G',
    aadhar: '456789012345',
    uan: '100765432109',
    bankDetails: 'ICICI Bank - A/C 001234567890 - ICIC0000012',
    emergencyNo: '+91 97234 11223',
  });

  // Update HODs for departments
  await prisma.department.update({
    where: { id: dept4.id },
    data: { HOD: admin.id },
  });

  await prisma.department.update({
    where: { id: dept1.id },
    data: { HOD: manager.id },
  });

  console.log('Seeding completed successfully!');
  console.log('Admin:', admin.email, '(password: admin123)');
  console.log('Manager:', manager.email, '(password: user123)');
  console.log('Staff:', staff.email, '(password: user123)');
}

main()
  .catch((e) => {
    console.error('Seeding error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
