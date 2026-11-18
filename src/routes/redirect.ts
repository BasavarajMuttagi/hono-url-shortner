import { Hono } from 'hono';
import { eq, and } from 'drizzle-orm';
import { db, urls } from '../db/index.js';
import { getCachedUrl, setCachedUrl, setNegativeCache } from '../cache/redis.js';
import { AsyncSingleFlight } from '../helpers/singleflight.js';
import { recordClickEvent } from '../clickhouse/client.js';
import { extractClientInfo } from '../helpers/parser.js';
import { env } from '../config/env.js';
import type { CachedURL } from '../types/models.js';
import type { AppEnv } from '../types/env.js';

export const redirectRouter = new Hono<AppEnv>();

// Dedicated SingleFlight instance for redirect lookups
const sf = new AsyncSingleFlight<CachedURL>();

// Reserved routes that must not be treated as short keys
const RESERVED_KEYS = new Set([
  'favicon.ico',
  'robots.txt',
  'health',
  'metrics',
  'docs',
  'api',
  'dashboard',
  'login',
  'register',
]);

redirectRouter.get('/:shortKey', async (c) => {
  const rawKey = c.req.param('shortKey')?.trim();
  if (!rawKey || RESERVED_KEYS.has(rawKey)) {
    return c.json({ error: 'Short URL not found' }, 404);
  }

  // 1. Hot Path: $O(1)$ Valkey Memory Lookup (<1ms)
  const cached = await getCachedUrl(rawKey);

  if (cached) {
    if (cached.notFound) {
      return c.json({ error: 'Short URL not found or inactive' }, 404);
    }

    // Fire-and-forget ClickHouse telemetry (non-blocking)
    if (cached.id) {
      const clientInfo = extractClientInfo(c, env.SALT_SECRET);
      const timestamp = new Date().toISOString().replace('T', ' ').replace('Z', '');
      recordClickEvent({
        url_id: cached.id,
        short_key: rawKey,
        timestamp,
        ip_hash: clientInfo.ipHash,
        country: clientInfo.country,
        city: clientInfo.city,
        browser: clientInfo.browser,
        os: clientInfo.os,
        device_type: clientInfo.deviceType,
        referrer: clientInfo.referrer,
      });
    }

    return c.redirect(cached.originalUrl, 302);
  }

  // 2. Slow Path: SingleFlight Protected Database Query
  // Collapses concurrent requests for the same key into a single DB query
  const record = await sf.do(rawKey, async (): Promise<CachedURL> => {
    // Double-check cache inside singleflight in case a concurrent call just populated it
    const secondCheck = await getCachedUrl(rawKey);
    if (secondCheck) return secondCheck;

    // Execute single Drizzle ORM query against PostgreSQL
    const rows = await db
      .select({
        id: urls.id,
        originalUrl: urls.originalUrl,
      })
      .from(urls)
      .where(and(eq(urls.shortKey, rawKey), eq(urls.isActive, true)))
      .limit(1);

    if (rows.length === 0) {
      // Negative caching: cache NOT_FOUND for 2 minutes to protect DB from hammering
      await setNegativeCache(rawKey, 120);
      return { id: '', originalUrl: '', notFound: true };
    }

    const found = rows[0];
    // Backfill Valkey with jittered TTL (24h +/- 10%)
    await setCachedUrl(rawKey, found.id, found.originalUrl);
    return { id: found.id, originalUrl: found.originalUrl, notFound: false };
  });

  if (record.notFound || !record.originalUrl) {
    return c.json({ error: 'Short URL not found or inactive' }, 404);
  }

  // Fire-and-forget ClickHouse telemetry (non-blocking)
  if (record.id) {
    const clientInfo = extractClientInfo(c, env.SALT_SECRET);
    const timestamp = new Date().toISOString().replace('T', ' ').replace('Z', '');
    recordClickEvent({
      url_id: record.id,
      short_key: rawKey,
      timestamp,
      ip_hash: clientInfo.ipHash,
      country: clientInfo.country,
      city: clientInfo.city,
      browser: clientInfo.browser,
      os: clientInfo.os,
      device_type: clientInfo.deviceType,
      referrer: clientInfo.referrer,
    });
  }

  // 3. Instant HTTP 302 Found Redirection
  return c.redirect(record.originalUrl, 302);
});
