import { Hono } from 'hono';
import { etag } from 'hono/etag';
import { eq, and } from 'drizzle-orm';
import { db, urls } from '../db/index.js';
import { clickhouse } from '../clickhouse/client.js';
import { redis } from '../cache/redis.js';
import { authGuard } from '../middleware/auth.js';
import type { AppEnv } from '../types/env.js';
import type { AnalyticsResponse } from '../types/models.js';

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

    // 2. Check Valkey cache for recent analytics response (TTL: 30 seconds)
    const cacheKey = `analytics:${urlId}`;
    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        c.header('X-Cache', 'HIT');
        c.header('Cache-Control', 'private, max-age=30');
        return c.json(JSON.parse(cached) as AnalyticsResponse, 200);
      }
    } catch (cacheErr) {
      console.warn('⚠️ [analyticsRouter] Valkey cache read failed, falling back to ClickHouse:', cacheErr);
    }

    // 3. Single consolidated multi-aggregation query in ClickHouse (reduces ClickHouse connections from 7 to 1)
    const consolidatedQuery = `
      SELECT 
        count() as total_clicks,
        uniq(ip_hash) as unique_visitors,
        (
          SELECT groupArray((date, clicks))
          FROM (
            SELECT 
              toString(toDate(timestamp)) as date,
              count() as clicks
            FROM click_events
            WHERE url_id = {urlId: UUID}
            GROUP BY date
            ORDER BY date ASC
          )
        ) as timeseries,
        (
          SELECT groupArray((country, count))
          FROM (
            SELECT 
              country,
              count() as count
            FROM click_events
            WHERE url_id = {urlId: UUID}
            GROUP BY country
            ORDER BY count DESC
            LIMIT 10
          )
        ) as top_countries,
        (
          SELECT groupArray((referrer, count))
          FROM (
            SELECT 
              referrer,
              count() as count
            FROM click_events
            WHERE url_id = {urlId: UUID}
            GROUP BY referrer
            ORDER BY count DESC
            LIMIT 10
          )
        ) as top_referrers,
        (
          SELECT groupArray((device_type, count))
          FROM (
            SELECT 
              device_type,
              count() as count
            FROM click_events
            WHERE url_id = {urlId: UUID}
            GROUP BY device_type
            ORDER BY count DESC
          )
        ) as devices,
        (
          SELECT groupArray((browser, count))
          FROM (
            SELECT 
              browser,
              count() as count
            FROM click_events
            WHERE url_id = {urlId: UUID}
            GROUP BY browser
            ORDER BY count DESC
            LIMIT 10
          )
        ) as browsers,
        (
          SELECT groupArray((os, count))
          FROM (
            SELECT 
              os,
              count() as count
            FROM click_events
            WHERE url_id = {urlId: UUID}
            GROUP BY os
            ORDER BY count DESC
            LIMIT 10
          )
        ) as operating_systems
      FROM click_events
      WHERE url_id = {urlId: UUID}
    `;

    interface ConsolidatedRow {
      total_clicks: string;
      unique_visitors: string;
      timeseries: [string, string][];
      top_countries: [string, string][];
      top_referrers: [string, string][];
      devices: [string, string][];
      browsers: [string, string][];
      operating_systems: [string, string][];
    }

    const chResult = await clickhouse.query({
      query: consolidatedQuery,
      query_params: { urlId },
    });
    const { data: chData } = await chResult.json<ConsolidatedRow>();
    const stats: ConsolidatedRow = chData[0] || {
      total_clicks: '0',
      unique_visitors: '0',
      timeseries: [],
      top_countries: [],
      top_referrers: [],
      devices: [],
      browsers: [],
      operating_systems: [],
    };

    const responseData: AnalyticsResponse = {
      urlId: urlRecord.id,
      shortKey: urlRecord.shortKey,
      totalClicks: parseInt(stats.total_clicks || '0', 10),
      uniqueVisitors: parseInt(stats.unique_visitors || '0', 10),
      timeseries: (stats.timeseries || []).map(([date, clicks]) => ({
        date,
        clicks: parseInt(clicks, 10),
      })),
      topCountries: (stats.top_countries || []).map(([name, count]) => ({
        name,
        count: parseInt(count, 10),
      })),
      topReferrers: (stats.top_referrers || []).map(([name, count]) => ({
        name,
        count: parseInt(count, 10),
      })),
      devices: (stats.devices || []).map(([name, count]) => ({
        name,
        count: parseInt(count, 10),
      })),
      browsers: (stats.browsers || []).map(([name, count]) => ({
        name,
        count: parseInt(count, 10),
      })),
      operatingSystems: (stats.operating_systems || []).map(([name, count]) => ({
        name,
        count: parseInt(count, 10),
      })),
    };

    // 4. Cache response in Valkey for 30 seconds
    try {
      await redis.set(cacheKey, JSON.stringify(responseData), 'EX', 30);
    } catch (cacheErr) {
      console.warn('⚠️ [analyticsRouter] Valkey cache write failed:', cacheErr);
    }

    c.header('X-Cache', 'MISS');
    c.header('Cache-Control', 'private, max-age=30');
    return c.json(responseData, 200);
} catch (err: unknown) {
  console.error('❌ [analyticsRouter] Error querying ClickHouse analytics:', err instanceof Error ? err.message : err);
  return c.json({ error: 'Internal server error querying analytics' }, 500);
}
});
