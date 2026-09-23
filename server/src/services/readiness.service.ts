import { PrismaClient } from '@prisma/client';
import { getReadinessStatus, } from '../utils/readiness.util';
const prisma = new PrismaClient();

export async function calculateReadiness(
  studentId: string,
  tenantId: string
) {
  const student = await prisma.student.findFirst({
    where: {
      id: studentId,
      tenantId,
    },
  });

  if (!student) {
    throw new Error('Student not found');
  }

  const competencies = await prisma.competency.findMany();

  const attempts = await prisma.attempt.findMany({
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

  // Keep only the latest attempt for each competency.
  const latestAttempts = new Map<string, typeof attempts[number]>();

  for (const attempt of attempts) {
    if (!latestAttempts.has(attempt.competency.key)) {
      latestAttempts.set(attempt.competency.key, attempt);
    }
  }

  // Every competency must have an attempt.
  const missingCompetencies = competencies
    .filter((competency) => !latestAttempts.has(competency.key))
    .map((competency) => competency.key);

  if (missingCompetencies.length > 0) {
    return {
      score: null,
      status: 'INCOMPLETE',
      missingCompetencies,
    };
  }

  let score = 0;

  for (const competency of competencies) {
    const attempt = latestAttempts.get(competency.key)!;

    score += attempt.score * competency.weight;
  }

  const roundedScore = Number(score.toFixed(2));

  const status = getReadinessStatus(roundedScore);
  return {
    score: roundedScore,
    status,
    missingCompetencies: [],
  };
}