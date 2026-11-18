import { Hono } from 'hono';
import { etag } from 'hono/etag';
import { eq, and } from 'drizzle-orm';
import { db, urls } from '../../db/index.js';
import { clickhouse } from '../../clickhouse/client.js';
import { authGuard } from '../../middleware/auth.js';
import type { AppEnv } from '../../types/env.js';
import type { AnalyticsResponse } from '../../types/models.js';

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
    // 1. Verify URL existence and ownership
    const urlRows = await db
      .select({
        id: urls.id,
        shortKey: urls.shortKey,
        userId: urls.userId,
      })
      .from(urls)
      .where(and(eq(urls.id, urlId), eq(urls.userId, userId)))
      .limit(1);

    if (urlRows.length === 0) {
      return c.json({ error: 'URL not found or unauthorized' }, 404);
    }

    const urlRecord = urlRows[0];

    // 2. Parallel vectorized aggregation queries in ClickHouse
    const [
      summaryResult,
      timeseriesResult,
      countriesResult,
      referrersResult,
      devicesResult,
      browsersResult,
      osResult,
    ] = await Promise.all([
      // Overall totals
      clickhouse
        .query({
          query: `
            SELECT 
              count() as total_clicks,
              uniq(ip_hash) as unique_visitors
            FROM click_events
            WHERE url_id = {urlId: UUID}
          `,
          query_params: { urlId },
        })
        .then((r) => r.json<{ total_clicks: string; unique_visitors: string }>()),

      // Daily timeseries
      clickhouse
        .query({
          query: `
            SELECT 
              toString(toDate(timestamp)) as date,
              count() as clicks
            FROM click_events
            WHERE url_id = {urlId: UUID}
          GROUP BY date
          ORDER BY date ASC
        `,
        query_params: { urlId },
      })
      .then((r) => r.json<{ date: string; clicks: string }>()),

    // Top 10 Countries
    clickhouse
      .query({
        query: `
          SELECT 
            country as name,
            count() as count
          FROM click_events
          WHERE url_id = {urlId: UUID}
          GROUP BY country
          ORDER BY count DESC
          LIMIT 10
        `,
        query_params: { urlId },
      })
      .then((r) => r.json<{ name: string; count: string }>()),

    // Top 10 Referrers
    clickhouse
      .query({
        query: `
          SELECT 
            referrer as name,
            count() as count
          FROM click_events
          WHERE url_id = {urlId: UUID}
          GROUP BY referrer
          ORDER BY count DESC
          LIMIT 10
        `,
        query_params: { urlId },
      })
      .then((r) => r.json<{ name: string; count: string }>()),

    // Devices breakdown
    clickhouse
      .query({
        query: `
          SELECT 
            device_type as name,
            count() as count
          FROM click_events
          WHERE url_id = {urlId: UUID}
          GROUP BY device_type
          ORDER BY count DESC
        `,
        query_params: { urlId },
      })
      .then((r) => r.json<{ name: string; count: string }>()),

    // Browsers breakdown
    clickhouse
      .query({
        query: `
          SELECT 
            browser as name,
            count() as count
          FROM click_events
          WHERE url_id = {urlId: UUID}
          GROUP BY browser
          ORDER BY count DESC
          LIMIT 10
        `,
        query_params: { urlId },
      })
      .then((r) => r.json<{ name: string; count: string }>()),

    // Operating systems breakdown
    clickhouse
      .query({
        query: `
          SELECT 
            os as name,
            count() as count
          FROM click_events
          WHERE url_id = {urlId: UUID}
          GROUP BY os
          ORDER BY count DESC
          LIMIT 10
        `,
        query_params: { urlId },
      })
      .then((r) => r.json<{ name: string; count: string }>()),
  ]);

  const summary = summaryResult.data[0] || { total_clicks: '0', unique_visitors: '0' };

  const responseData: AnalyticsResponse = {
    urlId: urlRecord.id,
    shortKey: urlRecord.shortKey,
    totalClicks: parseInt(summary.total_clicks || '0', 10),
    uniqueVisitors: parseInt(summary.unique_visitors || '0', 10),
    timeseries: (timeseriesResult.data || []).map((row) => ({
      date: row.date,
      clicks: parseInt(row.clicks, 10),
    })),
    topCountries: (countriesResult.data || []).map((row) => ({
      name: row.name,
      count: parseInt(row.count, 10),
    })),
    topReferrers: (referrersResult.data || []).map((row) => ({
      name: row.name,
      count: parseInt(row.count, 10),
    })),
    devices: (devicesResult.data || []).map((row) => ({
      name: row.name,
      count: parseInt(row.count, 10),
    })),
    browsers: (browsersResult.data || []).map((row) => ({
      name: row.name,
      count: parseInt(row.count, 10),
    })),
    operatingSystems: (osResult.data || []).map((row) => ({
      name: row.name,
      count: parseInt(row.count, 10),
    })),
  };

  c.header('Cache-Control', 'private, no-cache');
  return c.json(responseData, 200);
} catch (err: unknown) {
  console.error('❌ [analyticsRouter] Error querying ClickHouse analytics:', err instanceof Error ? err.message : err);
  return c.json({ error: 'Internal server error querying analytics' }, 500);
}
});
