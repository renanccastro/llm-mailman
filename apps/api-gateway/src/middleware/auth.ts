import { Request, Response, NextFunction } from 'express';
import { GitHubOAuthService } from '../services/github-oauth';
import { ApiResponse } from '@ai-dev/shared';

const githubOAuth = new GitHubOAuthService();

export interface AuthenticatedRequest extends Request {
  user: {
    userId: string;
    githubId: string;
    githubUsername: string;
    email: string;
  };
}

export function authenticateToken(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json<ApiResponse>({
      success: false,
      error: 'Access token is required',
      timestamp: new Date().toISOString(),
    });
  }

  try {
    const decoded = githubOAuth.verifyJWT(token);
    (req as AuthenticatedRequest).user = decoded;
    next();
  } catch (error) {
    return res.status(403).json<ApiResponse>({
      success: false,
      error: 'Invalid or expired token',
      timestamp: new Date().toISOString(),
    });
  }
}

export function optionalAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (token) {
    try {
      const decoded = githubOAuth.verifyJWT(token);
      (req as AuthenticatedRequest).user = decoded;
    } catch (error) {
      // Ignore invalid tokens in optional auth
    }
  }

  next();
}