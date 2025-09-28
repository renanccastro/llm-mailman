import rateLimit from 'express-rate-limit';
import { redis } from '@ai-dev/database';
import { Request, Response } from 'express';
import { RateLimitError, Constants } from '@ai-dev/shared';

interface RateLimitStore {
  increment(key: string): Promise<{ totalHits: number; resetTime?: Date }>;
  decrement(key: string): Promise<void>;
  resetKey(key: string): Promise<void>;
}

class RedisStore implements RateLimitStore {
  private windowMs: number;
  private keyPrefix: string;

  constructor(windowMs: number, keyPrefix = 'rate-limit:') {
    this.windowMs = windowMs;
    this.keyPrefix = keyPrefix;
  }

  async increment(key: string): Promise<{ totalHits: number; resetTime?: Date }> {
    const fullKey = `${this.keyPrefix}${key}`;
    const multi = redis.multi();

    multi.incr(fullKey);
    multi.pttl(fullKey);

    const results = await multi.exec();
    if (!results) {
      throw new Error('Redis transaction failed');
    }

    const totalHits = results[0][1] as number;
    const ttl = results[1][1] as number;

    if (ttl === -1) {
      // Key exists but has no TTL, set it
      await redis.pexpire(fullKey, this.windowMs);
    } else if (ttl === -2) {
      // Key doesn't exist, set it with TTL
      await redis.pexpire(fullKey, this.windowMs);
    }

    const resetTime = ttl > 0 ? new Date(Date.now() + ttl) : new Date(Date.now() + this.windowMs);

    return { totalHits, resetTime };
  }

  async decrement(key: string): Promise<void> {
    const fullKey = `${this.keyPrefix}${key}`;
    await redis.decr(fullKey);
  }

  async resetKey(key: string): Promise<void> {
    const fullKey = `${this.keyPrefix}${key}`;
    await redis.del(fullKey);
  }
}

// General API rate limit
export const apiRateLimit = rateLimit({
  windowMs: Constants.RATE_LIMIT_WINDOW,
  max: Constants.RATE_LIMIT_MAX_REQUESTS,
  message: 'Too many requests, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
  store: new RedisStore(Constants.RATE_LIMIT_WINDOW) as any,
  keyGenerator: (req: Request) => {
    // Use user ID if authenticated, otherwise use IP
    return req.user?.id || req.ip || 'unknown';
  },
  handler: (req: Request, res: Response) => {
    throw new RateLimitError('Rate limit exceeded', 60);
  },
});

// Stricter rate limit for auth endpoints
export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 requests per window
  message: 'Too many authentication attempts, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
  store: new RedisStore(15 * 60 * 1000, 'auth-limit:') as any,
  skipSuccessfulRequests: true, // Don't count successful requests
  keyGenerator: (req: Request) => {
    return req.ip || 'unknown';
  },
});

// Rate limit for request creation
export const requestCreationLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20, // 20 requests per hour
  message: 'Request creation limit exceeded',
  standardHeaders: true,
  legacyHeaders: false,
  store: new RedisStore(60 * 60 * 1000, 'request-limit:') as any,
  keyGenerator: (req: Request) => {
    return req.user?.id || req.ip || 'unknown';
  },
});

// Custom rate limit middleware for specific endpoints
export function customRateLimit(options: {
  windowMs?: number;
  max?: number;
  keyPrefix?: string;
  keyGenerator?: (req: Request) => string;
}) {
  const {
    windowMs = 15 * 60 * 1000,
    max = 10,
    keyPrefix = 'custom-limit:',
    keyGenerator = (req) => req.user?.id || req.ip || 'unknown',
  } = options;

  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    store: new RedisStore(windowMs, keyPrefix) as any,
    keyGenerator,
  });
}