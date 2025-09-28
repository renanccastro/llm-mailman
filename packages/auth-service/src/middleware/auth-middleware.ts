import { Request, Response, NextFunction } from 'express';
import { AuthenticationError, AuthorizationError } from '@ai-dev/shared';
import { AuthService } from '../services/auth-service';
import { User } from '@ai-dev/database';

declare global {
  namespace Express {
    interface Request {
      user?: User;
      session?: {
        id: string;
        userId: string;
        token: string;
      };
    }
  }
}

export async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null;

    if (!token) {
      throw new AuthenticationError('No authentication token provided');
    }

    const user = await AuthService.validateSession(token);

    if (!user) {
      throw new AuthenticationError('Invalid or expired token');
    }

    req.user = user;
    req.session = {
      id: '', // TODO: Get session ID
      userId: user.id,
      token,
    };

    next();
  } catch (error) {
    next(error);
  }
}

export function authorize(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new AuthenticationError('Authentication required'));
      return;
    }

    if (roles.length > 0 && !roles.includes(req.user.role)) {
      next(new AuthorizationError('Insufficient permissions'));
      return;
    }

    next();
  };
}

export async function optionalAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null;

    if (token) {
      const user = await AuthService.validateSession(token);
      if (user) {
        req.user = user;
        req.session = {
          id: '',
          userId: user.id,
          token,
        };
      }
    }

    next();
  } catch {
    // Ignore errors in optional auth
    next();
  }
}