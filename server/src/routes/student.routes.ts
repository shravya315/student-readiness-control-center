import { Router } from 'express';
import { listStudents, getStudent, patchStudent, getStudentActivityController } from '../controllers/student.controller';
import { authenticate } from '../middleware/auth.middleware';


const router = Router();

router.get('/', authenticate, listStudents);
router.get('/:id/activity', authenticate, getStudentActivityController);
router.get('/:id', authenticate, getStudent);
router.patch('/:id', authenticate, patchStudent);

export default router;