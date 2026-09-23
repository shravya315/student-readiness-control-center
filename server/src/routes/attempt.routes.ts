import { Router } from 'express';
import { submitAttempt } from '../controllers/attempt.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/rbac.middleware';

const router = Router();

router.post(
  '/students/:id/attempts',
  authenticate,
  requireRole('ADMIN', 'EVALUATOR'),
  submitAttempt,
);

export default router;