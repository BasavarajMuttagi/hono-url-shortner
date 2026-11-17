import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { eq, and, desc } from 'drizzle-orm';
import crypto from 'node:crypto';
import { db, urls } from '../db/index.js';
import { setCachedUrl, purgeCacheKey } from '../cache/redis.js';
import { generateShortKey, isValidShortKey } from '../helpers/base62.js';
import { authGuard } from '../middleware/auth.js';
import { linkCreateRateLimiter } from '../middleware/ratelimit.js';
import { env } from '../config/env.js';
import type { AppEnv } from '../types/env.js';

export const urlApp = new Hono<AppEnv>();

// Validation schema for creating short URLs
const createUrlSchema = z.object({
  original_url: z
    .string()
    .url('Must be a valid URL')
    .refine(
      (url) => url.startsWith('http://') || url.startsWith('https://'),
      'URL must start with http:// or https://'
    ),
  title: z.string().max(255).optional().default(''),
  custom_key: z
    .string()
    .min(1)
    .max(16)
    .regex(/^[0-9a-zA-Z_-]+$/, 'Custom key must contain only alphanumeric characters, dashes, or underscores')
    .optional(),
});

// Cache purge endpoint for stampede and load testing
urlApp.delete('/cache/:shortKey', authGuard, async (c) => {
  const shortKey = c.req.param('shortKey')?.trim();
  if (!shortKey) {
    return c.json({ error: 'Missing shortKey parameter' }, 400);
  }

  await purgeCacheKey(shortKey);
  return c.json({ status: 'purged', key: shortKey });
});

// All /urls routes require authentication (Cookie or Bearer)
urlApp.use('/urls/*', authGuard);
urlApp.use('/urls', authGuard);

// 1. Create a shortened URL
urlApp.post('/urls', linkCreateRateLimiter, zValidator('json', createUrlSchema), async (c) => {
  const { original_url, title, custom_key } = c.req.valid('json');
  const userId = c.get('userId' as any) as string;

  let shortKey = custom_key;

  // If custom key provided, check for collisions
  if (shortKey) {
    const existing = await db
      .select({ id: urls.id })
      .from(urls)
      .where(eq(urls.shortKey, shortKey))
      .limit(1);

    if (existing.length > 0) {
      return c.json({ error: 'Short key is already in use' }, 409);
    }
  } else {
    // Generate unique random Base62 key (with retry on rare collision)
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
  }

  const newId = crypto.randomUUID();
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

  const baseUrl = env.BASE_URL.replace(/\/+$/, '');
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
});

// 2. Retrieve URL metadata by ID
urlApp.get('/urls/:id', async (c) => {
  const id = c.req.param('id');
  const userId = c.get('userId' as any) as string;

  const rows = await db
    .select()
    .from(urls)
    .where(and(eq(urls.id, id), eq(urls.userId, userId)))
    .limit(1);

  if (rows.length === 0) {
    return c.json({ error: 'URL not found' }, 404);
  }

  const record = rows[0];
  const baseUrl = env.BASE_URL.replace(/\/+$/, '');
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
});

// 3. List URLs with pagination
urlApp.get('/urls', async (c) => {
  const userId = c.get('userId' as any) as string;
  const page = Math.max(1, parseInt(c.req.query('page') || '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(c.req.query('limit') || '20', 10)));
  const offset = (page - 1) * limit;

  const rows = await db
    .select()
    .from(urls)
    .where(eq(urls.userId, userId))
    .orderBy(desc(urls.createdAt))
    .limit(limit)
    .offset(offset);

  const baseUrl = env.BASE_URL.replace(/\/+$/, '');
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
});

// 4. Delete URL by ID
urlApp.delete('/urls/:id', async (c) => {
  const id = c.req.param('id');
  const userId = c.get('userId' as any) as string;

  const rows = await db
    .delete(urls)
    .where(and(eq(urls.id, id), eq(urls.userId, userId)))
    .returning({ id: urls.id, shortKey: urls.shortKey });

  if (rows.length === 0) {
    return c.json({ error: 'URL not found or already deleted' }, 404);
  }

  // Invalidate cache in Valkey
  await purgeCacheKey(rows[0].shortKey);

  return c.json({
    status: 'deleted',
    id: rows[0].id,
    short_key: rows[0].shortKey,
  });
});
