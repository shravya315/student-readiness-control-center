import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // -------------------------
  // Competencies
  // -------------------------
  const competencies = [
    ['frontend', 0.30],
    ['backend', 0.30],
    ['databases', 0.25],
    ['problem_solving', 0.15],
  ] as const;

  const competencyMap: Record<string, string> = {};

  for (const [key, weight] of competencies) {
    const competency = await prisma.competency.upsert({
      where: { key },
      update: { weight },
      create: { key, weight },
    });

    competencyMap[key] = competency.id;
  }

  // -------------------------
  // Tenants
  // -------------------------
  const tenantA = await prisma.tenant.upsert({
    where: { id: 'tenant-a' },
    update: {
      name: 'Acme University',
      status: 'ACTIVE',
    },
    create: {
      id: 'tenant-a',
      name: 'Acme University',
      status: 'ACTIVE',
    },
  });

  const tenantB = await prisma.tenant.upsert({
    where: { id: 'tenant-b' },
    update: {
      name: 'Beta Institute',
      status: 'ACTIVE',
    },
    create: {
      id: 'tenant-b',
      name: 'Beta Institute',
      status: 'ACTIVE',
    },
  });

  // -------------------------
  // Users
  // -------------------------
  const userA = await prisma.user.upsert({
    where: {
      tenantId_email: {
        tenantId: tenantA.id,
        email: 'admin@acme.test',
      },
    },
    update: {},
    create: {
      id: 'user-a',
      tenantId: tenantA.id,
      email: 'admin@acme.test',
      role: 'ADMIN',
    },
  });

  const userB = await prisma.user.upsert({
    where: {
      tenantId_email: {
        tenantId: tenantB.id,
        email: 'admin@beta.test',
      },
    },
    update: {},
    create: {
      id: 'user-b',
      tenantId: tenantB.id,
      email: 'admin@beta.test',
      role: 'ADMIN',
    },
  });

  // -------------------------
  // Students - Tenant A
  // -------------------------
  const studentA1 = await prisma.student.upsert({
    where: {
      tenantId_email: {
        tenantId: tenantA.id,
        email: 'student1@acme.test',
      },
    },
    update: {},
    create: {
      id: 'student-a1',
      tenantId: tenantA.id,
      email: 'student1@acme.test',
      name: 'Aarav Sharma',
    },
  });

  const studentA2 = await prisma.student.upsert({
    where: {
      tenantId_email: {
        tenantId: tenantA.id,
        email: 'student2@acme.test',
      },
    },
    update: {},
    create: {
      id: 'student-a2',
      tenantId: tenantA.id,
      email: 'student2@acme.test',
      name: 'Priya Mehta',
    },
  });

  // -------------------------
  // Student - Tenant B
  // -------------------------
  const studentB1 = await prisma.student.upsert({
    where: {
      tenantId_email: {
        tenantId: tenantB.id,
        email: 'student1@beta.test',
      },
    },
    update: {},
    create: {
      id: 'student-b1',
      tenantId: tenantB.id,
      email: 'student1@beta.test',
      name: 'Rohan Verma',
    },
  });

  // -------------------------
  // Attempts for Tenant A
  // -------------------------
  const attempts = [
    {
      tenantId: tenantA.id,
      studentId: studentA1.id,
      competencyId: competencyMap.frontend,
      score: 90,
      evaluatorId: userA.id,
    },
    {
      tenantId: tenantA.id,
      studentId: studentA1.id,
      competencyId: competencyMap.backend,
      score: 85,
      evaluatorId: userA.id,
    },
    {
      tenantId: tenantA.id,
      studentId: studentA1.id,
      competencyId: competencyMap.databases,
      score: 80,
      evaluatorId: userA.id,
    },
    {
      tenantId: tenantA.id,
      studentId: studentA1.id,
      competencyId: competencyMap.problem_solving,
      score: 75,
      evaluatorId: userA.id,
    },

    {
      tenantId: tenantA.id,
      studentId: studentA2.id,
      competencyId: competencyMap.frontend,
      score: 65,
      evaluatorId: userA.id,
    },
    {
      tenantId: tenantA.id,
      studentId: studentA2.id,
      competencyId: competencyMap.backend,
      score: 60,
      evaluatorId: userA.id,
    },
    {
      tenantId: tenantA.id,
      studentId: studentA2.id,
      competencyId: competencyMap.databases,
      score: 55,
      evaluatorId: userA.id,
    },
    {
      tenantId: tenantA.id,
      studentId: studentA2.id,
      competencyId: competencyMap.problem_solving,
      score: 50,
      evaluatorId: userA.id,
    },
  ];

  for (const attempt of attempts) {
    await prisma.attempt.create({
      data: attempt,
    });
  }

  // -------------------------
  // Attempt for Tenant B
  // -------------------------
  await prisma.attempt.create({
    data: {
      tenantId: tenantB.id,
      studentId: studentB1.id,
      competencyId: competencyMap.frontend,
      score: 70,
      evaluatorId: userB.id,
    },
  });

  console.log('Seed complete');
  console.log('Tenants: 2');
  console.log('Users: 2');
  console.log('Students: 3');
  console.log('Attempts: 9');
  console.log('Competencies: 4');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });