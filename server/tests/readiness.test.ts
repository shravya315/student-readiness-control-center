import { afterEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { calculateReadiness } from '../src/services/readiness.service';

const prisma = new PrismaClient();

const createdTenantIds: string[] = [];

async function createTenant(name: string) {
  const tenant = await prisma.tenant.create({
    data: {
      name,
      status: 'ACTIVE',
    },
  });

  createdTenantIds.push(tenant.id);
  return tenant;
}

async function getCompetencies() {
  const competencies = await prisma.competency.findMany({
    where: {
      key: {
        in: ['frontend', 'backend', 'databases', 'problem_solving'],
      },
    },
  });

  if (competencies.length !== 4) {
    throw new Error(
      `Expected 4 seeded competencies, found ${competencies.length}`,
    );
  }

  return competencies.sort((a, b) => {
    const order = ['frontend', 'backend', 'databases', 'problem_solving'];

    return order.indexOf(a.key) - order.indexOf(b.key);
  });
}

async function createStudent(tenantId: string) {
  return prisma.student.create({
    data: {
      tenantId,
      name: 'Test Student',
      email: `${crypto.randomUUID()}@test.com`,
    },
  });
}

async function createAttempt(
  tenantId: string,
  studentId: string,
  competencyId: string,
  score: number,
  submittedAt: Date,
  evaluatorId = 'test-evaluator',
) {
  return prisma.attempt.create({
    data: {
      tenantId,
      studentId,
      competencyId,
      score,
      evaluatorId,
      submittedAt,
      voided: false,
    },
  });
}

afterEach(async () => {
  if (createdTenantIds.length === 0) {
    return;
  }

  await prisma.attempt.deleteMany({
    where: {
      tenantId: {
        in: createdTenantIds,
      },
    },
  });

  await prisma.student.deleteMany({
    where: {
      tenantId: {
        in: createdTenantIds,
      },
    },
  });

  await prisma.user.deleteMany({
    where: {
      tenantId: {
        in: createdTenantIds,
      },
    },
  });

  await prisma.idempotencyRecord.deleteMany({
    where: {
      tenantId: {
        in: createdTenantIds,
      },
    },
  });

  await prisma.outboxEvent.deleteMany({
    where: {
      tenantId: {
        in: createdTenantIds,
      },
    },
  });

  await prisma.tenant.deleteMany({
    where: {
      id: {
        in: createdTenantIds,
      },
    },
  });

  createdTenantIds.length = 0;
});

describe('calculateReadiness', () => {
  it('returns INCOMPLETE when a competency is missing', async () => {
    const tenant = await createTenant('Readiness Test Tenant');
    const student = await createStudent(tenant.id);
    const competencies = await getCompetencies();

    await createAttempt(
      tenant.id,
      student.id,
      competencies[0].id,
      90,
      new Date(),
    );

    await createAttempt(
      tenant.id,
      student.id,
      competencies[1].id,
      80,
      new Date(),
    );

    const result = await calculateReadiness(student.id, tenant.id);

    expect(result.score).toBeNull();
    expect(result.status).toBe('INCOMPLETE');
    expect(result.missingCompetencies).toHaveLength(2);
  });

  it('calculates the weighted readiness score correctly', async () => {
    const tenant = await createTenant('Weighted Score Tenant');
    const student = await createStudent(tenant.id);
    const competencies = await getCompetencies();

    await createAttempt(
      tenant.id,
      student.id,
      competencies[0].id,
      100,
      new Date(),
    );

    await createAttempt(
      tenant.id,
      student.id,
      competencies[1].id,
      80,
      new Date(),
    );

    await createAttempt(
      tenant.id,
      student.id,
      competencies[2].id,
      60,
      new Date(),
    );

    await createAttempt(
      tenant.id,
      student.id,
      competencies[3].id,
      40,
      new Date(),
    );

    const result = await calculateReadiness(student.id, tenant.id);

    // 100*0.30 + 80*0.30 + 60*0.25 + 40*0.15 = 76
    expect(result.score).toBe(75);
    expect(result.status).toBe('NEARLY_READY');
    expect(result.missingCompetencies).toEqual([]);
  });

  it('uses the latest non-voided attempt for each competency', async () => {
    const tenant = await createTenant('Latest Attempt Tenant');
    const student = await createStudent(tenant.id);
    const competencies = await getCompetencies();

    const oldDate = new Date('2026-01-01T10:00:00.000Z');
    const newDate = new Date('2026-01-02T10:00:00.000Z');

    await createAttempt(
      tenant.id,
      student.id,
      competencies[0].id,
      20,
      oldDate,
    );

    await createAttempt(
      tenant.id,
      student.id,
      competencies[0].id,
      100,
      newDate,
    );

    await createAttempt(
      tenant.id,
      student.id,
      competencies[1].id,
      80,
      newDate,
    );

    await createAttempt(
      tenant.id,
      student.id,
      competencies[2].id,
      80,
      newDate,
    );

    await createAttempt(
      tenant.id,
      student.id,
      competencies[3].id,
      80,
      newDate,
    );

    const result = await calculateReadiness(student.id, tenant.id);

    // Latest frontend attempt = 100, not 20.
    // 100*0.30 + 80*0.30 + 80*0.25 + 80*0.15 = 86
    expect(result.score).toBe(86);
    expect(result.status).toBe('READY');
  });

  it('uses attempt id as the tie-breaker when submittedAt is equal', async () => {
    const tenant = await createTenant('Tie Break Tenant');
    const student = await createStudent(tenant.id);
    const competencies = await getCompetencies();

    const timestamp = new Date('2026-01-01T10:00:00.000Z');

    const first = await createAttempt(
      tenant.id,
      student.id,
      competencies[0].id,
      20,
      timestamp,
    );

    const second = await createAttempt(
      tenant.id,
      student.id,
      competencies[0].id,
      100,
      timestamp,
    );

    await createAttempt(
      tenant.id,
      student.id,
      competencies[1].id,
      80,
      timestamp,
    );

    await createAttempt(
      tenant.id,
      student.id,
      competencies[2].id,
      80,
      timestamp,
    );

    await createAttempt(
      tenant.id,
      student.id,
      competencies[3].id,
      80,
      timestamp,
    );

    const result = await calculateReadiness(student.id, tenant.id);

    const expectedScore =
      (second.id > first.id ? 100 : 20) * 0.3 +
      80 * 0.3 +
      80 * 0.25 +
      80 * 0.15;

    expect(result.score).toBe(Number(expectedScore.toFixed(2)));
  });

  it('does not access a student belonging to another tenant', async () => {
    const tenantA = await createTenant('Tenant A');
    const tenantB = await createTenant('Tenant B');

    const studentA = await createStudent(tenantA.id);

    await expect(
      calculateReadiness(studentA.id, tenantB.id),
    ).rejects.toThrow('Student not found');
  });

  it('ignores voided attempts', async () => {
    const tenant = await createTenant('Voided Attempt Tenant');
    const student = await createStudent(tenant.id);
    const competencies = await getCompetencies();

    const timestamp = new Date();

    await prisma.attempt.create({
      data: {
        tenantId: tenant.id,
        studentId: student.id,
        competencyId: competencies[0].id,
        score: 100,
        evaluatorId: 'test-evaluator',
        submittedAt: timestamp,
        voided: true,
      },
    });

    await createAttempt(
      tenant.id,
      student.id,
      competencies[1].id,
      80,
      timestamp,
    );

    await createAttempt(
      tenant.id,
      student.id,
      competencies[2].id,
      80,
      timestamp,
    );

    await createAttempt(
      tenant.id,
      student.id,
      competencies[3].id,
      80,
      timestamp,
    );

    const result = await calculateReadiness(student.id, tenant.id);

    expect(result.status).toBe('INCOMPLETE');
    expect(result.score).toBeNull();
    expect(result.missingCompetencies).toContain(competencies[0].key);
  });
});