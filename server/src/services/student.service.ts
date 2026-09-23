import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function getStudents(
  tenantId: string,
  options: {
    search?: string;
    status?: string;
    sortBy?: 'name' | 'score' | 'createdAt';
    sortOrder?: 'asc' | 'desc';
    page?: number;
    pageSize?: number;
  } = {}
) {
  const {
    search,
    status,
    sortBy = 'name',
    sortOrder = 'asc',
    page = 1,
    pageSize = 10,
  } = options;

  const safePage = Math.max(1, page);
  const safePageSize = Math.min(
    Math.max(1, pageSize),
    100
  );

  const where: any = {
    tenantId,
  };

  if (search?.trim()) {
    where.OR = [
      {
        name: {
          contains: search.trim(),
          mode: 'insensitive',
        },
      },
      {
        email: {
          contains: search.trim(),
          mode: 'insensitive',
        },
      },
    ];
  }

  /*
   * Readiness status is derived from currentScore.
   *
   * Students without a complete score are treated as
   * INCOMPLETE.
   */
  if (status) {
    switch (status) {
      case 'READY':
        where.currentScore = {
          gte: 80,
        };
        break;

      case 'NEARLY_READY':
        where.currentScore = {
          gte: 65,
          lt: 80,
        };
        break;

      case 'DEVELOPING':
        where.currentScore = {
          gte: 50,
          lt: 65,
        };
        break;

      case 'NEEDS_PREPARATION':
        where.currentScore = {
          not: null,
          lt: 50,
        };
        break;

      case 'INCOMPLETE':
        where.currentScore = null;
        break;

      default: {
        const error = new Error(
          'Invalid readiness status'
        );

        (error as any).code = 'INVALID_STATUS';

        throw error;
      }
    }
  }

  const orderBy =
    sortBy === 'score'
      ? [
          {
            currentScore: sortOrder,
          },
          {
            id: 'asc' as const,
          },
        ]
      : sortBy === 'createdAt'
        ? [
            {
              createdAt: sortOrder,
            },
            {
              id: 'asc' as const,
            },
          ]
        : [
            {
              name: sortOrder,
            },
            {
              id: 'asc' as const,
            },
          ];

  const [students, total] =
    await prisma.$transaction([
      prisma.student.findMany({
        where,
        select: {
          id: true,
          name: true,
          email: true,
          currentScore: true,
          version: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy,
        skip: (safePage - 1) * safePageSize,
        take: safePageSize,
      }),

      prisma.student.count({
        where,
      }),
    ]);

  return {
    students,
    pagination: {
      page: safePage,
      pageSize: safePageSize,
      total,
      totalPages: Math.ceil(
        total / safePageSize
      ),
    },
  };
}

export async function getStudentById(
  studentId: string,
  tenantId: string
) {
  return prisma.student.findFirst({
    where: {
      id: studentId,
      tenantId,
    },
    select: {
      id: true,
      name: true,
      email: true,
      currentScore: true,
      version: true,
      createdAt: true,
      updatedAt: true,
      attempts: {
        orderBy: {
          submittedAt: 'desc',
        },
        select: {
          id: true,
          competencyId: true,
          score: true,
          evaluatorId: true,
          submittedAt: true,
          voided: true,
        },
      },
    },
  });
}
export async function updateStudent(
  studentId: string,
  tenantId: string,
  data: {
    name?: string;
    email?: string;
    expectedVersion: number;
  }
) {
  const existingStudent = await prisma.student.findFirst({
    where: {
      id: studentId,
      tenantId,
    },
  });

  if (!existingStudent) {
    const error = new Error('Student not found');
    (error as any).code = 'STUDENT_NOT_FOUND';
    throw error;
  }

  const updated = await prisma.student.updateMany({
    where: {
      id: studentId,
      tenantId,
      version: data.expectedVersion,
    },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.email !== undefined && { email: data.email }),
      version: {
        increment: 1,
      },
    },
  });

  if (updated.count !== 1) {
    const error = new Error(
      'Student was modified by another request'
    );

    (error as any).code = 'VERSION_CONFLICT';

    throw error;
  }

  return prisma.student.findFirst({
    where: {
      id: studentId,
      tenantId,
    },
    select: {
      id: true,
      name: true,
      email: true,
      currentScore: true,
      version: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}