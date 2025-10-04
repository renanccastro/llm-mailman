import Redis from 'ioredis';

const redisUrl = process.env.REDIS_URL || 'redis://:redis_secret_2025@localhost:6379';

export const redis = new Redis(redisUrl, {
  retryStrategy: (times: number) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
  maxRetriesPerRequest: 3,
});

redis.on('connect', () => {
  console.info('✅ Redis connected successfully');
});

redis.on('error', (error) => {
  console.error('❌ Redis connection error:', error);
});

export const redisSession = new Redis(redisUrl, {
  db: 1, // Use different database for sessions
});

export const redisQueue = new Redis(redisUrl, {
  db: 2, // Use different database for job queues
  maxRetriesPerRequest: null, // Required for Bull queue
  enableReadyCheck: false, // Required for Bull queue
});

export async function connectRedis(): Promise<void> {
  try {
    await redis.ping();
    console.info('✅ Redis connection verified');
  } catch (error) {
    console.error('❌ Failed to connect to Redis:', error);
    throw error;
  }
}

export async function disconnectRedis(): Promise<void> {
  try {
    redis.disconnect();
    redisSession.disconnect();
    redisQueue.disconnect();
    console.info('Redis disconnected');
  } catch (error) {
    console.error('Failed to disconnect from Redis:', error);
    throw error;
  }
}