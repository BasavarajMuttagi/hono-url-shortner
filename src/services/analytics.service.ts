import { eq, and } from 'drizzle-orm';
import { db, urls } from '../db/index.js';
import { clickhouse } from '../clickhouse/client.js';
import { redis } from '../cache/redis.js';
import type { AnalyticsResponse } from '../types/models.js';

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

export class AnalyticsService {
  /**
   * Fetches analytics for a URL ID or shortKey, enforcing user ownership,
   * with Valkey caching (30s TTL) and ClickHouse OLAP aggregation.
   */
  static async getMetrics(identifier: string, userId: string): Promise<AnalyticsResponse | null> {
    // 1. Verify URL existence and ownership (supports either urlId UUID or shortKey)
    const urlRows = await db
      .select({
        id: urls.id,
        shortKey: urls.shortKey,
        userId: urls.userId,
      })
      .from(urls)
      .where(
        and(
          eq(urls.userId, userId),
          identifier.length === 36
            ? eq(urls.id, identifier)
            : eq(urls.shortKey, identifier)
        )
      )
      .limit(1);

    if (urlRows.length === 0) {
      return null;
    }

    const urlRecord = urlRows[0];
    const urlId = urlRecord.id;

    // 2. Check Valkey cache for recent analytics response (TTL: 30 seconds)
    const cacheKey = `analytics:${urlId}`;
    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached) as AnalyticsResponse;
      }
    } catch (cacheErr) {
      console.warn('⚠️ [AnalyticsService] Valkey cache read failed, falling back to ClickHouse:', cacheErr);
    }

    // 3. Consolidated multi-aggregation query in ClickHouse
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

    // 4. Cache formatted response in Valkey asynchronously (TTL: 30s)
    try {
      await redis.set(cacheKey, JSON.stringify(responseData), 'EX', 30);
    } catch (cacheSetErr) {
      console.warn('⚠️ [AnalyticsService] Valkey cache set failed:', cacheSetErr);
    }

    return responseData;
  }
}
