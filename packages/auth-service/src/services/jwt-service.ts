import jwt from 'jsonwebtoken';
import { User } from '@ai-dev/database';
import { JwtPayload, Constants } from '@ai-dev/shared';
import { JwtTokens } from '../types';

const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'change-me-refresh-in-production';

export class JwtService {
  static generateTokens(user: User): JwtTokens {
    const payload: JwtPayload = {
      userId: user.id,
      email: user.email,
      githubId: user.githubId,
      role: user.role,
    };

    const accessToken = jwt.sign(payload, JWT_SECRET, {
      expiresIn: Constants.JWT_EXPIRES_IN,
      issuer: 'aidev-platform',
      audience: 'aidev-api',
    });

    const refreshToken = jwt.sign({ userId: user.id }, JWT_REFRESH_SECRET, {
      expiresIn: Constants.JWT_REFRESH_EXPIRES_IN,
      issuer: 'aidev-platform',
      audience: 'aidev-refresh',
    });

    return {
      accessToken,
      refreshToken,
      expiresIn: 15 * 60, // 15 minutes in seconds
    };
  }

  static verifyAccessToken(token: string): JwtPayload {
    try {
      return jwt.verify(token, JWT_SECRET, {
        issuer: 'aidev-platform',
        audience: 'aidev-api',
      }) as JwtPayload;
    } catch (error) {
      throw new Error('Invalid or expired access token');
    }
  }

  static verifyRefreshToken(token: string): { userId: string } {
    try {
      return jwt.verify(token, JWT_REFRESH_SECRET, {
        issuer: 'aidev-platform',
        audience: 'aidev-refresh',
      }) as { userId: string };
    } catch (error) {
      throw new Error('Invalid or expired refresh token');
    }
  }

  static decodeToken(token: string): JwtPayload | null {
    try {
      return jwt.decode(token) as JwtPayload;
    } catch {
      return null;
    }
  }
}