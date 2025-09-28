import speakeasy from 'speakeasy';
import qrcode from 'qrcode';
import { TotpSetup } from '../types';

export class TotpService {
  static generateSecret(email: string): TotpSetup {
    const secret = speakeasy.generateSecret({
      name: `AI Dev Assistant (${email})`,
      issuer: 'AI Dev Assistant',
      length: 32,
    });

    return {
      secret: secret.base32,
      qrCode: '',
      manualEntryKey: secret.base32,
    };
  }

  static async generateQRCode(email: string, secret: string): Promise<string> {
    const otpauthUrl = speakeasy.otpauthURL({
      secret: secret,
      label: email,
      issuer: 'AI Dev Assistant',
      encoding: 'base32',
    });

    return await qrcode.toDataURL(otpauthUrl);
  }

  static verifyToken(token: string, secret: string): boolean {
    return speakeasy.totp.verify({
      secret: secret,
      encoding: 'base32',
      token: token,
      window: 2, // Allow 2 time steps before/after current time
    });
  }

  static generateBackupCodes(count = 10): string[] {
    const codes: string[] = [];
    for (let i = 0; i < count; i++) {
      const code = Math.random().toString(36).substring(2, 10).toUpperCase();
      codes.push(code);
    }
    return codes;
  }
}