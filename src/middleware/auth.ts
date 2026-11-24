import { createMiddleware } from 'hono/factory';
import { verify } from 'hono/jwt';
import { getCookie } from 'hono/cookie';
import { eq } from 'drizzle-orm';
import { db, users } from '../db/index.js';
import { redis } from '../cache/redis.js';
import { env } from '../config/env.js';
import type { AppEnv } from '../types/env.js';

export const COOKIE_NAME = 'auth_token';

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
  } catch (_err: unknown) {
    // If not a valid JWT (or expired/malformed), fall through to check API key
  }

  // 2. Fallback: Check as API key (Valkey cache + PostgreSQL fallback)
  let userId: string | null = null;
  try {
    userId = await redis.get(`auth:${token}`);
  } catch (err: unknown) {
    console.warn('⚠️ [authGuard] Valkey cache lookup failed, falling back to database:', err instanceof Error ? err.message : err);
  }

  if (!userId) {
    try {
      const rows = await db
        .select({ id: users.id, email: users.email })
        .from(users)
        .where(eq(users.apiKey, token))
        .limit(1);

      if (rows.length === 0) {
        return c.json({ error: 'Unauthorized: Invalid token or API key' }, 401);
      }

      userId = rows[0].id;
    } catch (dbErr: unknown) {
      console.error('❌ [authGuard] Database error during API key verification:', dbErr instanceof Error ? dbErr.message : dbErr);
      return c.json({ error: 'Internal server error during authentication' }, 500);
    }

    // Cache valid API key -> userId mapping for 1 hour
    try {
      await redis.set(`auth:${token}`, userId, 'EX', 3600);
    } catch (err: unknown) {
      console.warn('⚠️ [authGuard] Failed to cache API key to Valkey:', err instanceof Error ? err.message : err);
    }
  }

  c.set('userId', userId);
  await next();
});

/**
 * Strict OAuth 2.1 MCP Authentication Guard:
 * Strictly verifies Bearer token as an OAuth 2.1 scoped JWT access token.
 * Rejects static API keys and ambient browser cookies to prevent session leakage and CSRF.
 * Attaches RFC 9728 compliant WWW-Authenticate challenge header on failure.
 */
export const mcpAuthGuard = createMiddleware<AppEnv>(async (c, next) => {
  const authHeader = c.req.header('Authorization');
  let token: string | undefined;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim();
  }

  const sendUnauthorized = (errorDescription: string) => {
    try {
      const forwardedProto = c.req.header('x-forwarded-proto');
      const forwardedHost = c.req.header('x-forwarded-host');
      const host = forwardedHost || c.req.header('host');
      const isLocal = host && (host.includes('localhost') || host.includes('127.0.0.1'));
      const proto = forwardedProto || (isLocal ? 'http' : 'https');
      const origin = host ? `${proto}://${host}` : new URL(c.req.url).origin;

      c.header(
        'WWW-Authenticate',
        `Bearer realm="MCP", resource_metadata="${origin}/.well-known/oauth-protected-resource", error="invalid_token", error_description="${errorDescription}"`
      );
    } catch {
      c.header('WWW-Authenticate', 'Bearer realm="MCP"');
    }
    return c.json({ error: 'invalid_token', error_description: errorDescription }, 401);
  };

  // Reject missing Bearer token
  if (!token) {
    return sendUnauthorized('Missing OAuth 2.1 Bearer access token');
  }

  // Strictly verify as signed OAuth 2.1 JWT Access Token (Reject raw API keys)
  try {
    const payload = await verify(token, env.JWT_SECRET, 'HS256');
    if (payload && payload.sub) {
      // Validate scope strictly contains mcp:tools
      const rawScope = typeof payload.scope === 'string' ? payload.scope : '';
      const scopes = rawScope.split(/\s+/).filter(Boolean);
      if (!scopes.includes('mcp:tools')) {
        return c.json({ error: 'insufficient_scope', error_description: 'Token missing required mcp:tools scope' }, 403);
      }

      // If client_id is present, verify that the user's OAuth grant has not been revoked
      if (payload.client_id) {
        try {
          const grant = await redis.get(`oauth_grant:${payload.sub}:${payload.client_id}`);
          if (!grant) {
            return sendUnauthorized('Access token has been revoked');
          }
        } catch (grantErr) {
          console.warn('⚠️ [mcpAuthGuard] Valkey grant check warning:', grantErr);
        }
      }

      c.set('userId', String(payload.sub));
      c.set('userEmail', String(payload.email || ''));
      await next();
      return;
    }
  } catch (_err: unknown) {
    // Signature verification failure or expired token
  }

  return sendUnauthorized('Invalid or expired OAuth 2.1 Bearer access token');
});
