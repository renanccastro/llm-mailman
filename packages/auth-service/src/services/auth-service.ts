import { prisma, User, Session } from '@ai-dev/database';
import { AuthenticationError } from '@ai-dev/shared';
import { JwtService } from './jwt-service';
import { TotpService } from './totp-service';
import { JwtTokens } from '../types';

export class AuthService {
  static async createSession(user: User): Promise<{ session: Session; tokens: JwtTokens }> {
    const tokens = JwtService.generateTokens(user);

    // Calculate expiry times
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 15 * 60 * 1000); // 15 minutes
    const refreshExpiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const session = await prisma.session.create({
      data: {
        userId: user.id,
        token: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt,
        refreshExpiresAt,
        ipAddress: '', // TODO: Get from request
        userAgent: '', // TODO: Get from request
      },
    });

    // Update user last active
    await prisma.user.update({
      where: { id: user.id },
      data: { lastActiveAt: now },
    });

    return { session, tokens };
  }

  static async validateSession(token: string): Promise<User | null> {
    try {
      JwtService.verifyAccessToken(token);

      const session = await prisma.session.findUnique({
        where: { token },
        include: { user: true },
      });

      if (!session || session.expiresAt < new Date()) {
        return null;
      }

      // Update session activity
      await prisma.session.update({
        where: { id: session.id },
        data: { lastActivityAt: new Date() },
      });

      return session.user;
    } catch {
      return null;
    }
  }

  static async refreshSession(refreshToken: string): Promise<JwtTokens | null> {
    try {
      JwtService.verifyRefreshToken(refreshToken);

      const session = await prisma.session.findUnique({
        where: { refreshToken },
        include: { user: true },
      });

      if (!session || session.refreshExpiresAt < new Date()) {
        return null;
      }

      // Generate new tokens
      const tokens = JwtService.generateTokens(session.user);

      // Update session
      const now = new Date();
      await prisma.session.update({
        where: { id: session.id },
        data: {
          token: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          expiresAt: new Date(now.getTime() + 15 * 60 * 1000),
          refreshExpiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
          lastActivityAt: now,
        },
      });

      return tokens;
    } catch {
      return null;
    }
  }

  static async revokeSession(token: string): Promise<void> {
    await prisma.session.delete({
      where: { token },
    });
  }

  static async revokeSAllUserSessions(userId: string): Promise<void> {
    await prisma.session.deleteMany({
      where: { userId },
    });
  }

  static async enable2FA(userId: string): Promise<{ secret: string; qrCode: string }> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new AuthenticationError('User not found');
    }

    const { secret, manualEntryKey } = TotpService.generateSecret(user.email);
    const qrCode = await TotpService.generateQRCode(user.email, secret);

    // Store the secret temporarily (should be confirmed before enabling)
    await prisma.user.update({
      where: { id: userId },
      data: {
        totpSecret: secret, // TODO: Encrypt this
      },
    });

    return { secret: manualEntryKey, qrCode };
  }

  static async verify2FA(userId: string, token: string): Promise<boolean> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || !user.totpSecret) {
      return false;
    }

    const isValid = TotpService.verifyToken(token, user.totpSecret);

    if (isValid && !user.twoFactorEnabled) {
      // Enable 2FA if this is the first successful verification
      await prisma.user.update({
        where: { id: userId },
        data: { twoFactorEnabled: true },
      });
    }

    return isValid;
  }

  static async disable2FA(userId: string, token: string): Promise<boolean> {
    const isValid = await this.verify2FA(userId, token);

    if (isValid) {
      await prisma.user.update({
        where: { id: userId },
        data: {
          twoFactorEnabled: false,
          totpSecret: null,
        },
      });
      return true;
    }

    return false;
  }
}