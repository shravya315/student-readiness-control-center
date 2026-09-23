import { Router } from 'express';
import { submitAttempt } from '../controllers/attempt.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

router.post(
  '/students/:id/attempts',
  authenticate,
  submitAttempt
);

export default router;