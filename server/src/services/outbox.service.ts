import { PrismaClient } from '@prisma/client';
import { Event } from '../models/event.model';

const prisma = new PrismaClient();

export async function publishPendingOutboxEvents() {
  const events = await prisma.outboxEvent.findMany({
    where: {
      publishedAt: null,
    },
    orderBy: {
      createdAt: 'asc',
    },
    take: 20,
  });

  for (const outboxEvent of events) {
    try {
      const payload = outboxEvent.payload as Record<string, unknown>;

      await Event.updateOne(
        {
          eventId: outboxEvent.id,
        },
        {
          $setOnInsert: {
            eventId: outboxEvent.id,
            type: outboxEvent.eventType,
            tenantId: outboxEvent.tenantId,
            studentId: String(payload.studentId ?? ''),
            attemptId: payload.attemptId
              ? String(payload.attemptId)
              : undefined,
            idempotencyKey: outboxEvent.idempotencyKey,
            payload,
            createdAt: outboxEvent.createdAt,
          },
        },
        {
          upsert: true,
        }
      );

      await prisma.outboxEvent.update({
        where: {
          id: outboxEvent.id,
        },
        data: {
          publishedAt: new Date(),
          attempts: {
            increment: 1,
          },
          lastError: null,
        },
      });
    } catch (error) {
      await prisma.outboxEvent.update({
        where: {
          id: outboxEvent.id,
        },
        data: {
          attempts: {
            increment: 1,
          },
          lastError:
            error instanceof Error
              ? error.message
              : 'Unknown publishing error',
        },
      });

      console.error(
        `Failed to publish outbox event ${outboxEvent.id}:`,
        error
      );
    }
  }
}