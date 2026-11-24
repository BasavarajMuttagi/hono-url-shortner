import { Hono } from 'hono';
import { etag } from 'hono/etag';
import { authGuard } from '../middleware/auth.js';
import { AnalyticsService } from '../services/analytics.service.js';
import type { AppEnv } from '../types/env.js';

export const analyticsRouter = new Hono<AppEnv>();

// Analytics endpoint is secured with authGuard and leverages standard Hono ETag middleware
analyticsRouter.use('/urls/:id/analytics', authGuard);
analyticsRouter.use('/urls/:id/analytics', etag({ weak: true }));

analyticsRouter.get('/urls/:id/analytics', async (c) => {
  const urlId = c.req.param('id');
  const userId = c.get('userId');

  if (!urlId) {
    return c.json({ error: 'URL ID is required' }, 400);
  }

  try {
    const data = await AnalyticsService.getMetrics(urlId, userId);
    if (!data) {
      return c.json({ error: 'URL not found or unauthorized' }, 404);
    }

    c.header('Cache-Control', 'private, max-age=30');
    return c.json(data, 200);
  } catch (err: unknown) {
    console.error('❌ [analyticsRouter] Error querying ClickHouse analytics:', err instanceof Error ? err.message : err);
    return c.json({ error: 'Internal server error fetching analytics' }, 500);
  }
});
