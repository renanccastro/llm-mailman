import { User } from '@ai-dev/database';

export interface AuthenticatedRequest {
  user?: User;
  session?: {
    id: string;
    userId: string;
    token: string;
  };
}

export interface GitHubProfile {
  id: string;
  username: string;
  displayName?: string;
  emails?: Array<{ value: string; verified: boolean }>;
  photos?: Array<{ value: string }>;
  provider: string;
}

export interface JwtTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface TotpSetup {
  secret: string;
  qrCode: string;
  manualEntryKey: string;
}