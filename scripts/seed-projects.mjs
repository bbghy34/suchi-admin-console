import prisma from '../lib/prisma.js';

async function main() {
  console.log('Seeding initial project records...');

  // Get departments
  const marineDept = await prisma.department.findFirst({
    where: { name: 'Marine & Dredging Operations' },
  });
  const civilDept = await prisma.department.findFirst({
    where: { name: 'Civil Engineering & Construction' },
  });
  const tenderDept = await prisma.department.findFirst({
    where: { name: 'Tender & Estimation Division' },
  });

  // Get or create Contractors
  let contractor1 = await prisma.contractor.findFirst({
    where: { name: 'Oceanic Dredging & Marine Works Ltd' },
  });
  if (!contractor1) {
    contractor1 = await prisma.contractor.create({
      data: {
        name: 'Oceanic Dredging & Marine Works Ltd',
        phoneNo: '+91 98223 44556',
        description: 'Deep-sea cutter suction dredging, barge fleet, and reclamation operations.',
      },
    });
  }

  let contractor2 = await prisma.contractor.findFirst({
    where: { name: 'Coastal Infra Structures Pvt Ltd' },
  });
  if (!contractor2) {
    contractor2 = await prisma.contractor.create({
      data: {
        name: 'Coastal Infra Structures Pvt Ltd',
        phoneNo: '+91 98450 66778',
        description: 'Heavy piling, breakwaters, and harbor terminal civil engineering.',
      },
    });
  }

  // Create Project 1
  let project1 = await prisma.project.findFirst({
    where: { tenderId: 'TND-PPT-2026-01' },
  });
  if (!project1) {
    project1 = await prisma.project.create({
      data: {
        name: 'Paradip Port Harbor Deepening & Dredging Phase II',
        description: 'Capital dredging of western dock basin to 18m draft with reclamation bund construction.',
        type: 'Marine Dredging',
        status: 'ACTIVE',
        department: marineDept ? marineDept.id : null,
        contractor: contractor1.id, // Project.contractor -> Contractor.id
        progress: 45,
        tenderId: 'TND-PPT-2026-01',
        startDate: new Date('2026-01-15'),
        endDate: new Date('2026-11-30'),
        budget: 28500000,
        bOQs: 'BOQ-PPT-002',
      },
    });
  }

  // Create Project 2
  let project2 = await prisma.project.findFirst({
    where: { tenderId: 'TND-KOPT-2025-44' },
  });
  if (!project2) {
    project2 = await prisma.project.create({
      data: {
        name: 'Hooghly Riverfront Berth & Coastal Defense Pier',
        description: 'Reinforced concrete piling, jetty deck construction, and revetment stone pitching.',
        type: 'Civil Engineering',
        status: 'IN_PROGRESS',
        department: civilDept ? civilDept.id : null,
        contractor: contractor2.id, // Project.contractor -> Contractor.id
        progress: 70,
        tenderId: 'TND-KOPT-2025-44',
        startDate: new Date('2025-08-01'),
        endDate: new Date('2026-10-31'),
        budget: 19400000,
        bOQs: 'BOQ-KOPT-014',
      },
    });
  }

  // Create Project 3
  let project3 = await prisma.project.findFirst({
    where: { tenderId: 'TND-VIZAG-2026-88' },
  });
  if (!project3) {
    project3 = await prisma.project.create({
      data: {
        name: 'Visakhapatnam Outer Harbor Breakwater Expansion',
        description: 'Tetrapod placement, armor layer reinforcement, and navigational beacon installation.',
        type: 'Harbor Construction',
        status: 'PLANNING',
        department: civilDept ? civilDept.id : null,
        contractor: contractor2.id, // Project.contractor -> Contractor.id
        progress: 15,
        tenderId: 'TND-VIZAG-2026-88',
        startDate: new Date('2026-04-01'),
        endDate: new Date('2027-06-30'),
        budget: 42000000,
        bOQs: 'BOQ-VIZ-101',
      },
    });
  }

  console.log('Projects seeded successfully:');
  console.log('1.', project1.name, '-> Contractor:', contractor1.name);
  console.log('2.', project2.name, '-> Contractor:', contractor2.name);
  console.log('3.', project3.name, '-> Contractor:', contractor2.name);
}

main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
