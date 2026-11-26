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

  // 4. Security headers (HSTS, nosniff, etc. Configured for OAuth popup compatibility)
  app.use(
    '*',
    secureHeaders({
      xFrameOptions: false,
      crossOriginOpenerPolicy: false,
      crossOriginResourcePolicy: false,
    })
  );

  // 5. Cross-Origin Resource Sharing (includes MCP headers & OAuth metadata)
  app.use(
    '*',
    cors({
      origin: '*',
      allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowHeaders: [
        'Content-Type',
        'Authorization',
        'X-Request-Id',
        'Mcp-Session-Id',
        'Cache-Control',
        'Accept',
      ],
      exposeHeaders: [
        'Server-Timing',
        'ETag',
        'X-Request-Id',
        'Mcp-Session-Id',
        'WWW-Authenticate',
      ],
    })
  );

  // 6. Response compression (gzip / deflate)
  app.use('*', compress());

  // 7. Pretty JSON support with ?pretty
  app.use('*', prettyJSON());

  // 8. Strip trailing slashes
  app.use('*', trimTrailingSlash());

  // 9. Body payload size guard (16KB max payload)
  app.use(
    '*',
    bodyLimit({
      maxSize: 16 * 1024,
      onError: (c) => c.json({ error: 'Payload Too Large' }, 413),
    })
  );

  // 10. Timeout deadline (3s for high-throughput redirect/API routes; 30s for MCP streaming & ClickHouse OLAP)
  app.use('*', async (c, next) => {
    const path = c.req.path;
    if (path.startsWith('/mcp') || path.startsWith('/api/v1/analytics')) {
      return timeout(30000)(c, next);
    }
    return timeout(3000)(c, next);
  });
}
