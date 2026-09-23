import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { app } from '../src/app';

const prisma = new PrismaClient();

const JWT_SECRET =
  process.env.JWT_SECRET ?? 'development-secret';

function createToken(
  userId: string,
  tenantId: string,
  role = 'ADMIN',
) {
  return jwt.sign(
    {
      userId,
      tenantId,
      role,
    },
    JWT_SECRET,
  );
}

describe('Attempt API', () => {
  let tenantA: { id: string };
  let tenantB: { id: string };
  let userA: { id: string };
  let userB: { id: string };
  let studentA: { id: string };
  let studentB: { id: string };
  let frontendCompetency: { key: string };

  let tokenA: string;
  let tokenB: string;

  beforeAll(async () => {
    tenantA = await prisma.tenant.create({
      data: {
        name: `API Test Tenant A ${crypto.randomUUID()}`,
        status: 'ACTIVE',
      },
    });

    tenantB = await prisma.tenant.create({
      data: {
        name: `API Test Tenant B ${crypto.randomUUID()}`,
        status: 'ACTIVE',
      },
    });

    userA = await prisma.user.create({
      data: {
        tenantId: tenantA.id,
        email: `${crypto.randomUUID()}@acme.test`,
        role: 'ADMIN',
      },
    });

    userB = await prisma.user.create({
      data: {
        tenantId: tenantB.id,
        email: `${crypto.randomUUID()}@beta.test`,
        role: 'ADMIN',
      },
    });

    studentA = await prisma.student.create({
      data: {
        tenantId: tenantA.id,
        email: `${crypto.randomUUID()}@student.test`,
        name: 'API Test Student A',
      },
    });

    studentB = await prisma.student.create({
      data: {
        tenantId: tenantB.id,
        email: `${crypto.randomUUID()}@student.test`,
        name: 'API Test Student B',
      },
    });

    const competency = await prisma.competency.findUnique({
      where: {
        key: 'frontend',
      },
    });

    if (!competency) {
      throw new Error('Frontend competency was not seeded');
    }

    frontendCompetency = competency;

    tokenA = createToken(userA.id, tenantA.id);
    tokenB = createToken(userB.id, tenantB.id);
  });

  afterAll(async () => {
    await prisma.attempt.deleteMany({
      where: {
        OR: [
          { studentId: studentA.id },
          { studentId: studentB.id },
        ],
      },
    });

    await prisma.idempotencyRecord.deleteMany({
      where: {
        OR: [
          { tenantId: tenantA.id },
          { tenantId: tenantB.id },
        ],
      },
    });

    await prisma.outboxEvent.deleteMany({
      where: {
        OR: [
          { tenantId: tenantA.id },
          { tenantId: tenantB.id },
        ],
      },
    });

    await prisma.student.deleteMany({
      where: {
        id: {
          in: [studentA.id, studentB.id],
        },
      },
    });

    await prisma.user.deleteMany({
      where: {
        id: {
          in: [userA.id, userB.id],
        },
      },
    });

    await prisma.tenant.deleteMany({
      where: {
        id: {
          in: [tenantA.id, tenantB.id],
        },
      },
    });

    await prisma.$disconnect();
  });

  it('rejects requests without authentication', async () => {
    const response = await request(app)
      .post(`/api/students/${studentA.id}/attempts`)
      .set('Idempotency-Key', `missing-auth-${crypto.randomUUID()}`)
      .send({
        competency: frontendCompetency.key,
        score: 80,
      });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('rejects requests without an Idempotency-Key', async () => {
    const response = await request(app)
      .post(`/api/students/${studentA.id}/attempts`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        competency: frontendCompetency.key,
        score: 80,
      });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe(
      'IDEMPOTENCY_KEY_REQUIRED',
    );
  });

  it('rejects an invalid score', async () => {
    const response = await request(app)
      .post(`/api/students/${studentA.id}/attempts`)
      .set('Authorization', `Bearer ${tokenA}`)
      .set('Idempotency-Key', `invalid-score-${crypto.randomUUID()}`)
      .send({
        competency: frontendCompetency.key,
        score: 150,
      });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_SCORE');
  });

  it('rejects an invalid competency', async () => {
    const response = await request(app)
      .post(`/api/students/${studentA.id}/attempts`)
      .set('Authorization', `Bearer ${tokenA}`)
      .set(
        'Idempotency-Key',
        `invalid-competency-${crypto.randomUUID()}`,
      )
      .send({
        competency: 'does-not-exist',
        score: 80,
      });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe(
      'INVALID_COMPETENCY',
    );
  });

  it('rejects cross-tenant student access', async () => {
    const response = await request(app)
      .post(`/api/students/${studentB.id}/attempts`)
      .set('Authorization', `Bearer ${tokenA}`)
      .set(
        'Idempotency-Key',
        `cross-tenant-${crypto.randomUUID()}`,
      )
      .send({
        competency: frontendCompetency.key,
        score: 80,
      });

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe(
      'STUDENT_NOT_FOUND',
    );
  });

  it('creates an attempt successfully', async () => {
    const idempotencyKey = `success-${crypto.randomUUID()}`;

    const response = await request(app)
      .post(`/api/students/${studentA.id}/attempts`)
      .set('Authorization', `Bearer ${tokenA}`)
      .set('Idempotency-Key', idempotencyKey)
      .send({
        competency: frontendCompetency.key,
        score: 85,
      });

    expect(response.status).toBe(201);
    expect(response.body.replayed).toBe(false);
    expect(response.body.data).toBeDefined();

    const attempt = await prisma.attempt.findFirst({
      where: {
        studentId: studentA.id,
        competencyId: frontendCompetency.id,
        score: 85,
      },
    });

    expect(attempt).not.toBeNull();
  });

  it('replays the same request for the same idempotency key', async () => {
    const idempotencyKey = `replay-${crypto.randomUUID()}`;

    const payload = {
      competency: frontendCompetency.key,
      score: 70,
    };

    const firstResponse = await request(app)
      .post(`/api/students/${studentA.id}/attempts`)
      .set('Authorization', `Bearer ${tokenA}`)
      .set('Idempotency-Key', idempotencyKey)
      .send(payload);

    const secondResponse = await request(app)
      .post(`/api/students/${studentA.id}/attempts`)
      .set('Authorization', `Bearer ${tokenA}`)
      .set('Idempotency-Key', idempotencyKey)
      .send(payload);

    expect(firstResponse.status).toBe(201);
    expect(secondResponse.status).toBe(201);

    expect(firstResponse.body.replayed).toBe(false);
    expect(secondResponse.body.replayed).toBe(true);

    const attempts = await prisma.attempt.findMany({
      where: {
        studentId: studentA.id,
        competencyId: frontendCompetency.id,
        score: 70,
      },
    });

    expect(attempts).toHaveLength(1);
  });

  it('rejects reuse of an idempotency key with a different request', async () => {
    const idempotencyKey = `mismatch-${crypto.randomUUID()}`;

    const firstResponse = await request(app)
      .post(`/api/students/${studentA.id}/attempts`)
      .set('Authorization', `Bearer ${tokenA}`)
      .set('Idempotency-Key', idempotencyKey)
      .send({
        competency: frontendCompetency.key,
        score: 60,
      });

    const secondResponse = await request(app)
      .post(`/api/students/${studentA.id}/attempts`)
      .set('Authorization', `Bearer ${tokenA}`)
      .set('Idempotency-Key', idempotencyKey)
      .send({
        competency: frontendCompetency.key,
        score: 61,
      });

    expect(firstResponse.status).toBe(201);
    expect(secondResponse.status).toBe(409);

    expect(secondResponse.body.error.code).toBe(
      'IDEMPOTENCY_KEY_REUSED',
    );
  });
  it('rejects a student update with a stale expectedVersion', async () => {
  const student = await prisma.student.create({
    data: {
      tenantId: tenantA.id,
      email: `${crypto.randomUUID()}@version.test`,
      name: 'Version Test Student',
      version: 1,
    },
  });

  try {
    // First update: version 1 -> 2
    const firstResponse = await request(app)
      .patch(`/api/students/${student.id}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        name: 'Updated Student',
        expectedVersion: 1,
      });

    expect(firstResponse.status).toBe(200);
    expect(firstResponse.body.data.version).toBe(2);

    // Second update deliberately uses the stale version 1.
    const staleResponse = await request(app)
      .patch(`/api/students/${student.id}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        name: 'Stale Update',
        expectedVersion: 1,
      });

    expect(staleResponse.status).toBe(409);
    expect(staleResponse.body.error.code).toBe(
      'VERSION_CONFLICT',
    );

    // Confirm the stale request did not modify the student.
    const finalStudent = await prisma.student.findUnique({
      where: {
        id: student.id,
      },
    });

    expect(finalStudent?.name).toBe('Updated Student');
    expect(finalStudent?.version).toBe(2);
  } finally {
    await prisma.student.delete({
      where: {
        id: student.id,
      },
    });
  }
});

  it('handles parallel requests with the same idempotency key safely', async () => {
    const student = await prisma.student.create({
      data: {
        tenantId: tenantA.id,
        email: `${crypto.randomUUID()}@parallel.test`,
        name: 'Parallel Idempotency Student',
      },
    });

    const key = `parallel-${crypto.randomUUID()}`;

    try {
      const [firstResponse, secondResponse] = await Promise.all([
        request(app)
          .post(`/api/students/${student.id}/attempts`)
          .set('Authorization', `Bearer ${tokenA}`)
          .set('Idempotency-Key', key)
          .send({
            competency: frontendCompetency.key,
            score: 85,
          }),

        request(app)
          .post(`/api/students/${student.id}/attempts`)
          .set('Authorization', `Bearer ${tokenA}`)
          .set('Idempotency-Key', key)
          .send({
            competency: frontendCompetency.key,
            score: 85,
          }),
      ]);

      expect(firstResponse.status).toBe(201);
      expect(secondResponse.status).toBe(201);

      const responses = [firstResponse.body, secondResponse.body];

      expect(
        responses.filter((body) => body.replayed === true),
      ).toHaveLength(1);

      expect(
        responses.filter((body) => body.replayed !== true),
      ).toHaveLength(1);

      const attempts = await prisma.attempt.findMany({
        where: {
          tenantId: tenantA.id,
          studentId: student.id,
        },
      });

      expect(attempts).toHaveLength(1);

      const idempotencyRecords =
        await prisma.idempotencyRecord.findMany({
          where: {
            tenantId: tenantA.id,
            key,
          },
        });

      expect(idempotencyRecords).toHaveLength(1);

      const successEvents = await prisma.outboxEvent.findMany({
        where: {
          tenantId: tenantA.id,
          eventType: 'attempt.succeeded',
          idempotencyKey: key,
        },
      });

      expect(successEvents).toHaveLength(1);
    } finally {
      await prisma.attempt.deleteMany({
        where: {
          studentId: student.id,
        },
      });

      await prisma.idempotencyRecord.deleteMany({
        where: {
          tenantId: tenantA.id,
          key,
        },
      });

      await prisma.outboxEvent.deleteMany({
        where: {
          tenantId: tenantA.id,
          idempotencyKey: key,
        },
      });

      await prisma.student.delete({
        where: {
          id: student.id,
        },
      });
    }
  });

  it('rejects an invalid token', async () => {
    const response = await request(app)
      .post(`/api/students/${studentA.id}/attempts`)
      .set('Authorization', 'Bearer invalid-token')
      .set(
        'Idempotency-Key',
        `invalid-token-${crypto.randomUUID()}`,
      )
      .send({
        competency: frontendCompetency.key,
        score: 80,
      });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('INVALID_TOKEN');
  });
});