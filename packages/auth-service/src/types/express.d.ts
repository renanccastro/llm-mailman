import { UserRole } from '@ai-dev/database';

interface AuthUser {
  id: string;
  email: string;
  githubId: string;
  githubUsername: string;
  name: string | null;
  avatarUrl: string | null;
  role: UserRole;
  privateEmail: string | null;
  whatsappNumber: string | null;
  ipWhitelist: string[];
  totpSecret: string | null;
  twoFactorEnabled: boolean;
  yoloMode: boolean;
  notificationChannel: string;
  timezone: string;
  createdAt: Date;
  updatedAt: Date;
  lastActiveAt: Date | null;
  hasRepositoryAccess: boolean;
  isActive: boolean;
  lastLoginAt: Date | null;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      session?: {
        id: string;
        userId: string;
        token: string;
      };
    }
  }
}

export {};
