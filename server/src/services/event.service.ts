import crypto from 'crypto';
import { Event } from '../models/event.model';

interface AttemptSucceededEventInput {
  tenantId: string;
  studentId: string;
  attemptId: string;
  idempotencyKey: string;
  score: number;
  competency: string;
  evaluatorId: string;
  readiness: {
    score: number | null;
    status: string;
  };
}

export async function recordAttemptSucceeded(
  input: AttemptSucceededEventInput
) {
  const eventId = crypto.randomUUID();

  const event = await Event.create({
    eventId,
    type: 'attempt.succeeded',
    tenantId: input.tenantId,
    studentId: input.studentId,
    attemptId: input.attemptId,
    idempotencyKey: input.idempotencyKey,
    payload: {
      score: input.score,
      competency: input.competency,
      evaluatorId: input.evaluatorId,
      readiness: input.readiness,
    },
  });

  return event;
}