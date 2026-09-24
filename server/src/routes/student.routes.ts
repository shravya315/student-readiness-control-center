import { Router } from 'express';
import {
  listStudents,
  getStudent,
  patchStudent,
  getStudentActivityController,
} from '../controllers/student.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/rbac.middleware';

const router = Router();

router.use(authenticate);
router.use(requireRole('ADMIN', 'EVALUATOR'));

router.get('/', listStudents);
router.get('/:id/activity', getStudentActivityController);
router.get('/:id', getStudent);
router.patch('/:id', patchStudent);

export default router;