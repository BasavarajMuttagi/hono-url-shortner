import { rateLimiter, RedisStore, type RedisClient } from 'hono-rate-limiter';
import { redis } from '../cache/redis.js';
import type { AppEnv } from '../types/env.js';

const redisClientAdapter: RedisClient = {
  scriptLoad: (script: string) => redis.script('LOAD', script) as Promise<string>,
  evalsha: <TArgs extends unknown[], TData = unknown>(
    sha1: string,
    keys: string[],
    args: TArgs
  ): Promise<TData> =>
    redis.evalsha(sha1, keys.length, ...keys, ...(args as (string | number)[])) as Promise<TData>,
  decr: (key: string) => redis.decr(key),
  del: (key: string) => redis.del(key),
};

/**
 * Redis sliding-window rate limiter on link creation (100 requests / minute)
 */
export const linkCreateRateLimiter = rateLimiter<AppEnv>({
  windowMs: 60 * 1000,
  limit: 100,
  standardHeaders: 'draft-6',
  keyGenerator: (c) => {
    const userId = c.get('userId');
    if (userId) {
      return `ratelimit:urls:user:${userId}`;
    }
    const forwarded = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || '127.0.0.1';
    return `ratelimit:urls:ip:${forwarded.split(',')[0].trim()}`;
  },
  store: new RedisStore({
    client: redisClientAdapter,
  }),
});
