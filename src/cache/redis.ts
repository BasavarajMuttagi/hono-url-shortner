import { Redis } from 'ioredis';
import { env } from '../config/env.js';
import type { CachedURL } from '../types/models.js';

// Base TTL: 24 hours in seconds
const BASE_TTL_SECONDS = 24 * 60 * 60; // 86400s

/**
 * Calculates a jittered TTL (+/- 10% randomization)
 * to prevent synchronized cache expirations ("cache avalanche").
 */
export function calculateJitteredTtl(baseSeconds: number = BASE_TTL_SECONDS): number {
  const tenPercent = Math.floor(baseSeconds * 0.1);
  const jitter = Math.floor(Math.random() * (tenPercent * 2)) - tenPercent;
  return baseSeconds + jitter;
}

export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  lazyConnect: true,
  tls: env.REDIS_URL.startsWith('rediss://') ? { rejectUnauthorized: false } : undefined,
});

redis.on('error', (err) => {
  console.error('⚠️ Valkey/Redis error:', err.message);
});

export async function checkRedisConnection(): Promise<boolean> {
  try {
    if (redis.status === 'wait') {
      await redis.connect();
    }
    const pong = await redis.ping();
    return pong === 'PONG';
  } catch (err) {
    console.error('❌ Failed to connect to Valkey/Redis:', err);
    return false;
  }
}

/**
 * Retrieves a cached URL entry from Valkey.
 * Returns null on cache miss, or CachedURL object.
 */
export async function getCachedUrl(shortKey: string): Promise<CachedURL | null> {
  try {
    const val = await redis.get(`url:${shortKey}`);
    if (!val) return null;

    if (val === 'NOT_FOUND') {
      return { id: '', originalUrl: '', notFound: true };
    }

    // Modern structured JSON cache entry
    if (val.startsWith('{')) {
      const parsed = JSON.parse(val) as { id?: string; originalUrl?: string };
      return { id: parsed.id || '', originalUrl: parsed.originalUrl || '', notFound: false };
    }

    // Backward-compatibility fallback
    const firstPipe = val.indexOf('|');
    if (firstPipe !== -1) {
      const id = val.substring(0, firstPipe);
      const originalUrl = val.substring(firstPipe + 1);
      return { id, originalUrl, notFound: false };
    }
    return { id: '', originalUrl: val, notFound: false };
  } catch (err) {
    console.error(`⚠️ Redis get error for key ${shortKey}:`, err);
    return null; // Fallback to DB on Redis error
  }
}

/**
 * Sets a cached URL entry with jittered TTL using structured JSON serialization.
 */
export async function setCachedUrl(
  shortKey: string,
  id: string,
  originalUrl: string,
  ttlSeconds: number = calculateJitteredTtl()
): Promise<void> {
  try {
    const payload = JSON.stringify({ id, originalUrl });
    await redis.set(`url:${shortKey}`, payload, 'EX', ttlSeconds);
  } catch (err) {
    console.error(`⚠️ Redis set error for key ${shortKey}:`, err);
  }
}

/**
 * Sets a negative cache entry (NOT_FOUND) with a short 2-minute TTL
 * to prevent cache stampedes / DB hammering on non-existent keys.
 */
export async function setNegativeCache(shortKey: string, ttlSeconds: number = 120): Promise<void> {
  try {
    await redis.set(`url:${shortKey}`, 'NOT_FOUND', 'EX', ttlSeconds);
  } catch (err) {
    console.error(`⚠️ Redis negative cache error for key ${shortKey}:`, err);
  }
}

/**
 * Purges a cache key from Valkey.
 */
export async function purgeCacheKey(shortKey: string): Promise<void> {
  try {
    await redis.del(`url:${shortKey}`);
  } catch (err) {
    console.error(`⚠️ Redis purge error for key ${shortKey}:`, err);
  }
}

/**
 * Purges an analytics cache key from Valkey.
 */
export async function purgeAnalyticsCache(urlId: string): Promise<void> {
  try {
    await redis.del(`analytics:${urlId}`);
  } catch (err) {
    console.error(`⚠️ Redis purge error for analytics ${urlId}:`, err);
  }
}

export async function closeRedis(): Promise<void> {
  await redis.quit();
}
