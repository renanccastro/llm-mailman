import { Request, Response, NextFunction } from 'express';
import { AuthenticationError, AuthorizationError } from '@ai-dev/shared';
import { AuthService } from '../services/auth-service';
import { UserRole } from '@ai-dev/database';

export async function authenticate(
  req: Request,
  _res: Response,
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

export function authorize(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new AuthenticationError('Authentication required'));
      return;
    }

    const user = req.user as any;
    if (roles.length > 0 && !roles.includes(user.role)) {
      next(new AuthorizationError('Insufficient permissions'));
      return;
    }

    next();
  };
}

export async function optionalAuth(
  req: Request,
  _res: Response,
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