import type { Hono } from 'hono';
import { requestId } from 'hono/request-id';
import { logger } from 'hono/logger';
import { timing } from 'hono/timing';
import { secureHeaders } from 'hono/secure-headers';
import { cors } from 'hono/cors';
import { compress } from 'hono/compress';
import { timeout } from 'hono/timeout';
import { trimTrailingSlash } from 'hono/trailing-slash';
import { prettyJSON } from 'hono/pretty-json';
import { bodyLimit } from 'hono/body-limit';
import { env } from '../config/env.js';
import type { AppEnv } from '../types/env.js';

/**
 * Registers application-level HTTP middleware applied to all incoming requests.
 */
export function setupAppMiddleware(app: Hono<AppEnv>): void {
  // 1. Request ID (default: X-Request-Id header & crypto.randomUUID)
  app.use('*', requestId());

  // 2. Built-in Hono HTTP Logger (default)
  app.use('*', logger());

  // 3. Server-Timing headers (durations for cache, db, etc.)
  app.use('*', timing());

  // 3. Security headers (HSTS, nosniff, etc.)
  app.use('*', secureHeaders());

  // 4. Cross-Origin Resource Sharing
  app.use(
    '*',
    cors({
      origin: '*',
      allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
      exposeHeaders: ['Server-Timing', 'ETag', 'X-Request-Id'],
    })
  );

  // 5. Response compression (gzip / deflate)
  app.use('*', compress());

  // 6. Pretty JSON support with ?pretty
  app.use('*', prettyJSON());

  // 7. Strip trailing slashes
  app.use('*', trimTrailingSlash());

  // 8. Body payload size guard (16KB max payload)
  app.use(
    '*',
    bodyLimit({
      maxSize: 16 * 1024,
      onError: (c) => c.json({ error: 'Payload Too Large' }, 413),
    })
  );

  // 9. Timeout deadline (3 seconds)
  app.use('*', timeout(3000));
}
