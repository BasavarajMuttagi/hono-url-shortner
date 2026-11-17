import { createMiddleware } from 'hono/factory';
import { verify } from 'hono/jwt';
import { getCookie } from 'hono/cookie';
import { eq } from 'drizzle-orm';
import { db, users } from '../db/index.js';
import { redis } from '../cache/redis.js';
import { env } from '../config/env.js';
import type { AppEnv } from '../types/env.js';

const COOKIE_NAME = 'auth_token';

/**
 * Unified Authentication Guard:
 * 1. Checks HTTP-Only Cookie ('auth_token')
 * 2. Checks Authorization header ('Bearer <token>')
 * Validates either signed JWT or API key.
 */
export const authGuard = createMiddleware<AppEnv>(async (c, next) => {
  let token: string | undefined = getCookie(c, COOKIE_NAME);

  if (!token) {
    const authHeader = c.req.header('Authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7).trim();
    }
  }

  if (!token) {
    return c.json({ error: 'Unauthorized: Missing authentication cookie or Bearer token' }, 401);
  }

  // 1. Try verifying as signed JWT
  try {
    const payload = await verify(token, env.JWT_SECRET, 'HS256');
    if (payload && payload.sub) {
      c.set('userId', String(payload.sub));
      c.set('userEmail', String(payload.email || ''));
      await next();
      return;
    }
  } catch (err) {
    // If not a valid JWT, fall through to check API key
  }

  // 2. Fallback: Check as API key (Valkey cache + PostgreSQL fallback)
  let userId: string | null = null;
  try {
    userId = await redis.get(`auth:${token}`);
  } catch (err) {
    // non-fatal
  }

  if (!userId) {
    const rows = await db
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(eq(users.apiKey, token))
      .limit(1);

    if (rows.length === 0) {
      return c.json({ error: 'Unauthorized: Invalid token or API key' }, 401);
    }

    userId = rows[0].id;

    // Cache valid API key -> userId mapping for 1 hour
    try {
      await redis.set(`auth:${token}`, userId, 'EX', 3600);
    } catch (err) {
      // non-fatal
    }
  }

  c.set('userId', userId);
  await next();
});
