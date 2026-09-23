import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';

export interface AuthUser {
  userId: string;
  tenantId: string;
  role: string;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthUser;
}

export function authenticate(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  const header = req.headers.authorization;

  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({
      error: {
        code: 'UNAUTHENTICATED',
        message: 'Authentication required',
      },
    });
  }

  const token = header.substring(7);

  try {
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET ?? 'development-secret'
    );

    if (
      typeof decoded !== 'object' ||
      !decoded ||
      typeof decoded.userId !== 'string' ||
      typeof decoded.tenantId !== 'string' ||
      typeof decoded.role !== 'string'
    ) {
      return res.status(401).json({
        error: {
          code: 'INVALID_TOKEN',
          message: 'Invalid authentication token',
        },
      });
    }

    req.user = {
      userId: decoded.userId,
      tenantId: decoded.tenantId,
      role: decoded.role,
    };

    next();
  } catch (error) {
    console.error('JWT verification failed:', error);

    return res.status(401).json({
      error: {
        code: 'INVALID_TOKEN',
        message: 'Invalid authentication token',
      },
    });
  }
}