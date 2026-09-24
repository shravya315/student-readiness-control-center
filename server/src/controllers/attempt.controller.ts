import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { createAttempt } from '../services/attempt.service';

export async function submitAttempt(
  req: AuthenticatedRequest,
  res: Response
) {
  try {
    // Authentication check
    if (!req.user) {
      return res.status(401).json({
        error: {
          code: 'UNAUTHENTICATED',
          message: 'Authentication required',
        },
      });
    }

    // Idempotency key is required
    const idempotencyKey = req.headers['idempotency-key'];

    if (
      typeof idempotencyKey !== 'string' ||
      !idempotencyKey.trim()
    ) {
      return res.status(400).json({
        error: {
          code: 'IDEMPOTENCY_KEY_REQUIRED',
          message: 'Idempotency-Key header is required',
        },
      });
    }

    const studentId= Array.isArray(req.params.id)?req.params.id[0]:req.params.id;
    const { competency, score } = req.body;

    // Validate competency
    if (
      typeof competency !== 'string' ||
      !competency.trim()
    ) {
      return res.status(400).json({
        error: {
          code: 'INVALID_COMPETENCY',
          message: 'Competency is required',
        },
      });
    }

    // Validate score
    if (typeof score !== 'number') {
      return res.status(400).json({
        error: {
          code: 'INVALID_SCORE',
          message: 'Score must be a number',
        },
      });
    }

    const result = await createAttempt({
      studentId,
      tenantId: req.user.tenantId,
      evaluatorId: req.user.userId,
      competencyKey: competency,
      score,
      idempotencyKey,
    });

    return res.status(result.statusCode).json({
      data: result.response,
      replayed: result.replayed,
    });
  } catch (error) {
    const code = (error as any)?.code;

    if (code === 'STUDENT_NOT_FOUND') {
      return res.status(404).json({
        error: {
          code,
          message: 'Student not found',
        },
      });
    }

    if (code === 'INVALID_COMPETENCY') {
      return res.status(400).json({
        error: {
          code,
          message: 'Invalid competency',
        },
      });
    }

    if (code === 'INVALID_SCORE') {
      return res.status(400).json({
        error: {
          code,
          message: 'Score must be between 0 and 100',
        },
      });
    }

    if (code === 'IDEMPOTENCY_KEY_REUSED') {
      return res.status(409).json({
        error: {
          code,
          message:
            'Idempotency key was already used with a different request',
        },
      });
    }

    if (code === 'VERSION_CONFLICT') {
      return res.status(409).json({
        error: {
          code,
          message:
            'Student was modified by another request',
        },
      });
    }

    console.error('Failed to create attempt:', error);

    return res.status(500).json({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Unable to create attempt',
      },
    });
  }
}