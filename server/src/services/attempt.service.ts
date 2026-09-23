import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

const prisma = new PrismaClient();

function fingerprintRequest(
  studentId: string,
  competency: string,
  score: number
) {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify({ studentId, competency, score }))
    .digest('hex');
}

async function createRejectedOutboxEvent(input: {
  tenantId: string;
  studentId: string;
  idempotencyKey: string;
  reason: string;
  details?: Record<string, unknown>;
}) {
  await prisma.outboxEvent.create({
    data: {
      tenantId: input.tenantId,
      eventType: 'attempt.rejected',
      aggregateId: input.studentId,
      idempotencyKey: input.idempotencyKey,
      payload: {
        studentId: input.studentId,
        reason: input.reason,
        ...(input.details ?? {}),
      },
    },
  });
}

export async function createAttempt({
  studentId,
  tenantId,
  evaluatorId,
  competencyKey,
  score,
  idempotencyKey,
}: {
  studentId: string;
  tenantId: string;
  evaluatorId: string;
  competencyKey: string;
  score: number;
  idempotencyKey: string;
}) {
  const fingerprint = fingerprintRequest(
    studentId,
    competencyKey,
    score
  );

  /*
   * First check whether this request was already completed.
   * This handles normal retries without doing unnecessary work.
   */
  const existing = await prisma.idempotencyRecord.findUnique({
    where: {
      tenantId_key: {
        tenantId,
        key: idempotencyKey,
      },
    },
  });

  if (existing) {
    if (existing.requestFingerprint !== fingerprint) {
      const error = new Error(
        'Idempotency key was already used with a different request'
      );

      (error as any).code = 'IDEMPOTENCY_KEY_REUSED';

      throw error;
    }

    return {
      replayed: true,
      statusCode: existing.statusCode ?? 201,
      response: existing.responseJson,
    };
  }

  try {
    /*
     * The actual attempt and idempotency record are created
     * inside one PostgreSQL transaction.
     */
    return await prisma.$transaction(async (tx) => {
      /*
       * Re-check inside the transaction.
       *
       * Another concurrent request may have created the
       * idempotency record between our first check and here.
       */
      const concurrentExisting =
        await tx.idempotencyRecord.findUnique({
          where: {
            tenantId_key: {
              tenantId,
              key: idempotencyKey,
            },
          },
        });

      if (concurrentExisting) {
        if (
          concurrentExisting.requestFingerprint !== fingerprint
        ) {
          const error = new Error(
            'Idempotency key was already used with a different request'
          );

          (error as any).code = 'IDEMPOTENCY_KEY_REUSED';

          throw error;
        }

        return {
          replayed: true,
          statusCode: concurrentExisting.statusCode ?? 201,
          response: concurrentExisting.responseJson,
        };
      }

      const student = await tx.student.findFirst({
        where: {
          id: studentId,
          tenantId,
        },
      });

      if (!student) {
        const error = new Error('Student not found');
        (error as any).code = 'STUDENT_NOT_FOUND';
        throw error;
      }

      const competency = await tx.competency.findUnique({
        where: {
          key: competencyKey,
        },
      });

      if (!competency) {
        const error = new Error('Invalid competency');
        (error as any).code = 'INVALID_COMPETENCY';
        throw error;
      }

      if (
        !Number.isFinite(score) ||
        score < 0 ||
        score > 100
      ) {
        const error = new Error(
          'Score must be between 0 and 100'
        );

        (error as any).code = 'INVALID_SCORE';

        throw error;
      }

      /*
       * Create the attempt.
       */
      const attempt = await tx.attempt.create({
        data: {
          tenantId,
          studentId,
          competencyId: competency.id,
          score,
          evaluatorId,
        },
        include: {
          competency: true,
        },
      });

      /*
       * Get all non-voided attempts for this student.
       */
      const attempts = await tx.attempt.findMany({
        where: {
          studentId,
          tenantId,
          voided: false,
        },
        orderBy: [
          {
            submittedAt: 'desc',
          },
          {
            id: 'desc',
          },
        ],
        include: {
          competency: true,
        },
      });

      /*
       * Pick the latest attempt for every competency.
       *
       * Because the query is ordered by submittedAt DESC
       * and then id DESC, equal timestamps are resolved
       * deterministically by attempt ID.
       */
      const latestAttempts = new Map<
        string,
        (typeof attempts)[number]
      >();

      for (const item of attempts) {
        if (!latestAttempts.has(item.competency.key)) {
          latestAttempts.set(item.competency.key, item);
        }
      }

      const competencies = await tx.competency.findMany();

      const hasAllCompetencies = competencies.every(
        (item) => latestAttempts.has(item.key)
      );

      let currentScore: number | null = null;

      if (hasAllCompetencies) {
        let calculatedScore = 0;

        for (const item of competencies) {
          const latest = latestAttempts.get(item.key)!;

          calculatedScore +=
            latest.score * item.weight;
        }

        currentScore = Number(
          calculatedScore.toFixed(2)
        );
      }

      /*
       * Optimistic concurrency control.
       *
       * The student is updated only if the version we read
       * is still the current version.
       */
      const updatedStudent = await tx.student.updateMany({
        where: {
          id: studentId,
          tenantId,
          version: student.version,
        },
        data: {
          currentScore,
          version: {
            increment: 1,
          },
        },
      });

      if (updatedStudent.count !== 1) {
        const error = new Error(
          'Student was modified by another request'
        );

        (error as any).code = 'VERSION_CONFLICT';

        throw error;
      }

      let status:
        | 'READY'
        | 'NEARLY_READY'
        | 'DEVELOPING'
        | 'NEEDS_PREPARATION';

      if (currentScore === null) {
        status = 'NEEDS_PREPARATION';
      } else if (currentScore >= 80) {
        status = 'READY';
      } else if (currentScore >= 65) {
        status = 'NEARLY_READY';
      } else if (currentScore >= 50) {
        status = 'DEVELOPING';
      } else {
        status = 'NEEDS_PREPARATION';
      }

      const readiness = {
        score: currentScore,
        status:
          currentScore === null
            ? 'INCOMPLETE'
            : status,
      };

      const response = {
        attempt,
        readiness,
      };

      /*
       * Create the idempotency record in the SAME
       * PostgreSQL transaction as the attempt.
       */
      await tx.idempotencyRecord.create({
        data: {
          tenantId,
          key: idempotencyKey,
          requestFingerprint: fingerprint,
          responseJson: response,
          statusCode: 201,
          expiresAt: new Date(
            Date.now() + 24 * 60 * 60 * 1000
          ),
        },
      });
      await tx.outboxEvent.create({
  data: {
    tenantId,
    eventType: 'attempt.succeeded',
    aggregateId: attempt.id,
    idempotencyKey,
    payload: {
      studentId,
      attemptId: attempt.id,
      score,
      competency: competencyKey,
      evaluatorId,
      readiness,
    },
  },
});

      return {
        replayed: false,
        statusCode: 201,
        response,
      };
    });
   } catch (error) {
    const errorCode = (error as any)?.code;

    // Idempotency conflicts are handled separately.
    // They are request conflicts, not new rejected attempts.
    if (errorCode === 'IDEMPOTENCY_KEY_REUSED') {
      throw error;
    }

    // Record operational rejection after the transaction has rolled back.
    // This keeps rejected events separate from the successful attempt
    // transaction and avoids partial relational writes.
    if (
      errorCode === 'STUDENT_NOT_FOUND' ||
      errorCode === 'INVALID_COMPETENCY' ||
      errorCode === 'INVALID_SCORE' ||
      errorCode === 'VERSION_CONFLICT'
    ) {
      try {
        await createRejectedOutboxEvent({
          tenantId,
          studentId,
          idempotencyKey,
          reason: errorCode,
          details: {
            competency: competencyKey,
            score,
            evaluatorId,
          },
        });
      } catch (outboxError) {
        console.error(
          'Failed to create attempt.rejected outbox event:',
          outboxError
        );
      }
    }

    /*
     * If two requests arrive at exactly the same time,
     * both may initially see no idempotency record.
     *
     * PostgreSQL's UNIQUE constraint guarantees that only
     * one transaction can successfully create the record.
     */
    if (
      errorCode === 'P2002' &&
      (error as any)?.meta?.target?.includes('tenantId') &&
      (error as any)?.meta?.target?.includes('key')
    ) {
      const concurrentRecord =
        await prisma.idempotencyRecord.findUnique({
          where: {
            tenantId_key: {
              tenantId,
              key: idempotencyKey,
            },
          },
        });

      if (!concurrentRecord) {
        throw error;
      }

      if (
        concurrentRecord.requestFingerprint !== fingerprint
      ) {
        const conflict = new Error(
          'Idempotency key was already used with a different request'
        );

        (conflict as any).code =
          'IDEMPOTENCY_KEY_REUSED';

        throw conflict;
      }

      return {
        replayed: true,
        statusCode:
          concurrentRecord.statusCode ?? 201,
        response: concurrentRecord.responseJson,
      };
    }

    throw error;
  }
}