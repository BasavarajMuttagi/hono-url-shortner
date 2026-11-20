import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { eq, and, desc } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import { db, urls } from '../db/index.js';
import { setCachedUrl, purgeCacheKey } from '../cache/redis.js';
import { clickhouse } from '../clickhouse/client.js';
import { generateShortKey } from '../helpers/base62.js';
import { authGuard } from '../middleware/auth.js';
import { linkCreateRateLimiter } from '../middleware/ratelimit.js';
import { env } from '../config/env.js';
import type { AppEnv } from '../types/env.js';

export const urlRouter = new Hono<AppEnv>();

// Validation schema for creating short URLs
const createUrlSchema = z.object({
  original_url: z
    .string()
    .url('Must be a valid URL')
    .refine(
      (url) => url.startsWith('http://') || url.startsWith('https://'),
      'URL must start with http:// or https://'
    )
    .refine(
      (url) => !/[<>"{}\\|\\^` ]/.test(url),
      'URL contains illegal unencoded characters (characters like | must be percent-encoded as %7C per RFC 3986)'
    ),
  title: z.string().max(255).optional().default(''),
});

// Cache purge endpoint for stampede and load testing
urlRouter.delete('/cache/:shortKey', authGuard, async (c) => {
  const shortKey = c.req.param('shortKey')?.trim();
  if (!shortKey) {
    return c.json({ error: 'Missing shortKey parameter' }, 400);
  }

  try {
    await purgeCacheKey(shortKey);
    return c.json({ status: 'purged', key: shortKey });
  } catch (err: unknown) {
    console.error('❌ [urlRouter.cachePurge] Error purging cache key:', err instanceof Error ? err.message : err);
    return c.json({ error: 'Failed to purge cache key' }, 500);
  }
});

// All /urls routes require authentication (Cookie or Bearer)
urlRouter.use('/urls/*', authGuard);
urlRouter.use('/urls', authGuard);

// 1. Create a shortened URL (POST /urls)
urlRouter.post('/urls', linkCreateRateLimiter, zValidator('json', createUrlSchema), async (c) => {
  const { original_url, title } = c.req.valid('json');
  const userId = c.get('userId');

  try {
    // Scalable, collision-resistant 7-character Base62 key generation
    let shortKey = '';
    let attempts = 0;
    while (!shortKey && attempts < 5) {
      attempts++;
      const candidate = generateShortKey(7);
      const existing = await db
        .select({ id: urls.id })
        .from(urls)
        .where(eq(urls.shortKey, candidate))
        .limit(1);

      if (existing.length === 0) {
        shortKey = candidate;
        break;
      }
    }

    if (!shortKey) {
      return c.json({ error: 'Failed to generate a unique short key, please try again' }, 500);
    }

    const newId = uuidv7();
    const now = new Date();

    // Insert into PostgreSQL via Drizzle ORM
    const [created] = await db
      .insert(urls)
      .values({
        id: newId,
        userId: userId,
        shortKey: shortKey,
        originalUrl: original_url,
        title: title || '',
        isActive: true,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    // Pre-populate Valkey cache (<1ms subsequent lookups)
    await setCachedUrl(shortKey, created.id, created.originalUrl);

    const baseUrl = new URL(c.req.url).origin;
    return c.json(
      {
        id: created.id,
        short_key: created.shortKey,
        short_url: `${baseUrl}/${created.shortKey}`,
        original_url: created.originalUrl,
        title: created.title,
        is_active: created.isActive,
        created_at: created.createdAt,
      },
      201
    );
  } catch (err: unknown) {
    console.error('❌ [urlRouter.create] Error creating short URL:', err instanceof Error ? err.message : err);
    return c.json({ error: 'Internal server error creating short URL' }, 500);
  }
});

// 2. Retrieve URL metadata by ID (GET /urls/:id)
urlRouter.get('/urls/:id', async (c) => {
  const id = c.req.param('id');
  const userId = c.get('userId');

  try {
    const rows = await db
      .select()
      .from(urls)
      .where(and(eq(urls.id, id), eq(urls.userId, userId)))
      .limit(1);

    if (rows.length === 0) {
      return c.json({ error: 'URL not found' }, 404);
    }

    const record = rows[0];
    const baseUrl = new URL(c.req.url).origin;
    return c.json({
      id: record.id,
      short_key: record.shortKey,
      short_url: `${baseUrl}/${record.shortKey}`,
      original_url: record.originalUrl,
      title: record.title,
      is_active: record.isActive,
      created_at: record.createdAt,
      updated_at: record.updatedAt,
    });
  } catch (err: unknown) {
    console.error('❌ [urlRouter.getById] Error fetching URL by id:', err instanceof Error ? err.message : err);
    return c.json({ error: 'Internal server error retrieving URL' }, 500);
  }
});

// 3. List URLs with pagination (GET /urls)
urlRouter.get('/urls', async (c) => {
  const userId = c.get('userId');
  const page = Math.max(1, parseInt(c.req.query('page') || '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(c.req.query('limit') || '20', 10)));
  const offset = (page - 1) * limit;

  try {
    const rows = await db
      .select()
      .from(urls)
      .where(eq(urls.userId, userId))
      .orderBy(desc(urls.createdAt))
      .limit(limit)
      .offset(offset);

    const baseUrl = new URL(c.req.url).origin;
    const items = rows.map((r) => ({
      id: r.id,
      short_key: r.shortKey,
      short_url: `${baseUrl}/${r.shortKey}`,
      original_url: r.originalUrl,
      title: r.title,
      is_active: r.isActive,
      created_at: r.createdAt,
    }));

    return c.json({
      data: items,
      page,
      limit,
      count: items.length,
    });
  } catch (err: unknown) {
    console.error('❌ [urlRouter.list] Error listing user URLs:', err instanceof Error ? err.message : err);
    return c.json({ error: 'Internal server error listing URLs' }, 500);
  }
});

// 4. Delete URL by ID (DELETE /urls/:id)
urlRouter.delete('/urls/:id', async (c) => {
  const id = c.req.param('id');
  const userId = c.get('userId');

  try {
    const rows = await db
      .delete(urls)
      .where(and(eq(urls.id, id), eq(urls.userId, userId)))
      .returning({ id: urls.id, shortKey: urls.shortKey });

    if (rows.length === 0) {
      return c.json({ error: 'URL not found or already deleted' }, 404);
    }

    // Invalidate cache in Valkey
    await purgeCacheKey(rows[0].shortKey);

    // Clean up telemetry events in ClickHouse asynchronously
    try {
      await clickhouse.command({
        query: `ALTER TABLE click_events DELETE WHERE url_id = '${rows[0].id}'`,
      });
    } catch (_err: unknown) {
      // Non-fatal if ClickHouse cleanup encounters background mutation queue
    }

    return c.json({
      status: 'deleted',
      id: rows[0].id,
      short_key: rows[0].shortKey,
    });
  } catch (err: unknown) {
    console.error('❌ [urlRouter.delete] Error deleting URL:', err instanceof Error ? err.message : err);
    return c.json({ error: 'Internal server error deleting URL' }, 500);
  }
});
