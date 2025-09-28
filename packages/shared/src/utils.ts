import crypto from 'crypto';

export function generateToken(length = 32): string {
  return crypto.randomBytes(length).toString('hex');
}

export function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex');
}

export function encryptData(text: string, key: string): string {
  const algorithm = 'aes-256-gcm';
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(algorithm, Buffer.from(key, 'hex'), iv);

  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted;
}

export function decryptData(encryptedData: string, key: string): string {
  const parts = encryptedData.split(':');
  const iv = Buffer.from(parts[0], 'hex');
  const authTag = Buffer.from(parts[1], 'hex');
  const encrypted = parts[2];

  const algorithm = 'aes-256-gcm';
  const decipher = crypto.createDecipheriv(algorithm, Buffer.from(key, 'hex'), iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function retry<T>(
  fn: () => Promise<T>,
  retries = 3,
  delay = 1000,
  backoff = 2,
): Promise<T> {
  return fn().catch((error) => {
    if (retries <= 0) {
      throw error;
    }
    return sleep(delay).then(() => retry(fn, retries - 1, delay * backoff, backoff));
  });
}

export function sanitizeCommand(command: string): string {
  // Remove potentially dangerous characters and commands
  const dangerous = [';', '&&', '||', '|', '>', '<', '`', '$', '\\', '\n', '\r'];
  let sanitized = command;

  dangerous.forEach((char) => {
    sanitized = sanitized.replace(new RegExp(`\\${char}`, 'g'), '');
  });

  return sanitized.trim();
}

export function parseRepositoryName(input: string): { owner: string; repo: string } | null {
  const match = input.match(/^([a-zA-Z0-9-]+)\/([a-zA-Z0-9._-]+)$/);
  if (!match) return null;

  return {
    owner: match[1],
    repo: match[2],
  };
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

export function truncateString(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 3) + '...';
}