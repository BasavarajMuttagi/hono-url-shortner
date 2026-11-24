import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { purgeCacheKey } from '../cache/redis.js';
import { authGuard } from '../middleware/auth.js';
import { linkCreateRateLimiter } from '../middleware/ratelimit.js';
import { UrlService } from '../services/url.service.js';
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

// Cache purge endpoint for stampede and load testing (strictly disabled in production)
if (env.NODE_ENV !== 'production') {
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
}

// All /urls routes require authentication (Cookie or Bearer)
urlRouter.use('/urls/*', authGuard);
urlRouter.use('/urls', authGuard);

// 1. Create a shortened URL (POST /urls)
urlRouter.post('/urls', linkCreateRateLimiter, zValidator('json', createUrlSchema), async (c) => {
  const { original_url, title } = c.req.valid('json');
  const userId = c.get('userId');

  try {
    const created = await UrlService.create(userId, original_url, title);
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
    const record = await UrlService.getById(id, userId);
    if (!record) {
      return c.json({ error: 'URL not found' }, 404);
    }

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

  try {
    const result = await UrlService.list(userId, page, limit);
    const baseUrl = new URL(c.req.url).origin;

    const items = result.data.map((r) => ({
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
      page: result.page,
      limit: result.limit,
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
    const deleted = await UrlService.delete(id, userId);
    if (!deleted) {
      return c.json({ error: 'URL not found or already deleted' }, 404);
    }

    return c.json({
      status: 'deleted',
      id: deleted.id,
      short_key: deleted.shortKey,
    });
  } catch (err: unknown) {
    console.error('❌ [urlRouter.delete] Error deleting URL:', err instanceof Error ? err.message : err);
    return c.json({ error: 'Internal server error deleting URL' }, 500);
  }
});
