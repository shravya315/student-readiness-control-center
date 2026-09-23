import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { getStudents, getStudentById, updateStudent } from '../services/student.service';
import { getStudentActivity } from '../services/activity.service';

export async function listStudents(
  req: AuthenticatedRequest,
  res: Response
) {
  try {
    if (!req.user) {
      return res.status(401).json({
        error: {
          code: 'UNAUTHENTICATED',
          message: 'Authentication required',
        },
      });
    }

    const search =
      typeof req.query.search === 'string'
        ? req.query.search
        : undefined;

    const status =
      typeof req.query.status === 'string'
        ? req.query.status
        : undefined;

    const sortBy =
      typeof req.query.sortBy === 'string'
        ? req.query.sortBy
        : 'name';

    const sortOrder =
      typeof req.query.sortOrder === 'string'
        ? req.query.sortOrder
        : 'asc';

    const page =
      typeof req.query.page === 'string'
        ? Number(req.query.page)
        : 1;

    const pageSize =
      typeof req.query.pageSize === 'string'
        ? Number(req.query.pageSize)
        : 10;

    if (
      !['name', 'score', 'createdAt'].includes(sortBy)
    ) {
      return res.status(400).json({
        error: {
          code: 'INVALID_SORT',
          message: 'Invalid sort field',
        },
      });
    }

    if (!['asc', 'desc'].includes(sortOrder)) {
      return res.status(400).json({
        error: {
          code: 'INVALID_SORT_ORDER',
          message: 'Invalid sort order',
        },
      });
    }

    if (
      !Number.isInteger(page) ||
      page < 1 ||
      !Number.isInteger(pageSize) ||
      pageSize < 1 ||
      pageSize > 100
    ) {
      return res.status(400).json({
        error: {
          code: 'INVALID_PAGINATION',
          message:
            'Page must be >= 1 and pageSize must be between 1 and 100',
        },
      });
    }

    const result = await getStudents(
      req.user.tenantId,
      {
        search,
        status,
        sortBy: sortBy as
          | 'name'
          | 'score'
          | 'createdAt',
        sortOrder: sortOrder as 'asc' | 'desc',
        page,
        pageSize,
      }
    );

    return res.status(200).json({
      data: result.students,
      pagination: result.pagination,
    });
  } catch (error) {
    const code = (error as any)?.code;

    if (code === 'INVALID_STATUS') {
      return res.status(400).json({
        error: {
          code,
          message: 'Invalid readiness status',
        },
      });
    }

    console.error(
      'Failed to fetch students:',
      error
    );

    return res.status(500).json({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Unable to fetch students',
      },
    });
  }
}

export async function getStudent(
  req: AuthenticatedRequest,
  res: Response
) {
  try {
    if (!req.user) {
      return res.status(401).json({
        error: {
          code: 'UNAUTHENTICATED',
          message: 'Authentication required',
        },
      });
    }

    const studentId = Array.isArray(req.params.id)
    ? req.params.id[0] 
    : req.params.id;
    const student= await getStudentById(
      studentId,
      req.user.tenantId
    );

    if (!student) {
      return res.status(404).json({
        error: {
          code: 'STUDENT_NOT_FOUND',
          message: 'Student not found',
        },
      });
    }

    return res.status(200).json({
      data: student,
    });
  } catch (error) {
    console.error('Failed to fetch student:', error);

    return res.status(500).json({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Unable to fetch student',
      },
    });
  }
}

export async function patchStudent(
  req: AuthenticatedRequest,
  res: Response
) {
  try {
    if (!req.user) {
      return res.status(401).json({
        error: {
          code: 'UNAUTHENTICATED',
          message: 'Authentication required',
        },
      });
    }

    const studentId = Array.isArray(req.params.id)
      ? req.params.id[0]
      : req.params.id;

    const { name, email, expectedVersion } = req.body;

    if (
      typeof expectedVersion !== 'number' ||
      !Number.isInteger(expectedVersion) ||
      expectedVersion < 1
    ) {
      return res.status(400).json({
        error: {
          code: 'INVALID_VERSION',
          message: 'expectedVersion must be a positive integer',
        },
      });
    }

    if (
      name !== undefined &&
      (typeof name !== 'string' || !name.trim())
    ) {
      return res.status(400).json({
        error: {
          code: 'INVALID_NAME',
          message: 'Name must be a non-empty string',
        },
      });
    }

    if (
      email !== undefined &&
      (typeof email !== 'string' || !email.trim())
    ) {
      return res.status(400).json({
        error: {
          code: 'INVALID_EMAIL',
          message: 'Email must be a non-empty string',
        },
      });
    }

    if (name === undefined && email === undefined) {
      return res.status(400).json({
        error: {
          code: 'NO_CHANGES',
          message: 'At least one field must be provided',
        },
      });
    }

    const student = await updateStudent(
      studentId,
      req.user.tenantId,
      {
        name,
        email,
        expectedVersion,
      }
    );

    return res.status(200).json({
      data: student,
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

    if (code === 'VERSION_CONFLICT') {
      return res.status(409).json({
        error: {
          code,
          message: 'Student was modified by another request',
        },
      });
    }

    console.error('Failed to update student:', error);

    return res.status(500).json({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Unable to update student',
      },
    });
  }
}

export async function getStudentActivityController(
  req: AuthenticatedRequest,
  res: Response
) {
  try {
    if (!req.user) {
      return res.status(401).json({
        error: {
          code: 'UNAUTHENTICATED',
          message: 'Authentication required',
        },
      });
    }

    const studentId = Array.isArray(req.params.id)
      ? req.params.id[0]
      : req.params.id;

    /*
     * Check the student in PostgreSQL first.
     *
     * This prevents MongoDB activity from revealing whether
     * a student belonging to another tenant exists.
     */
    const student = await getStudentById(
      studentId,
      req.user.tenantId
    );

    if (!student) {
      return res.status(404).json({
        error: {
          code: 'STUDENT_NOT_FOUND',
          message: 'Student not found',
        },
      });
    }

    const activity = await getStudentActivity(
      studentId,
      req.user.tenantId
    );

    return res.status(200).json({
      data: activity,
    });
  } catch (error) {
    console.error('Failed to fetch student activity:', error);

    return res.status(500).json({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Unable to fetch student activity',
      },
    });
  }
}