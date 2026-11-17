import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import crypto from 'node:crypto';
import { app } from '../src/app.js';
import { db, urls } from '../src/db/index.js';
import { clickhouse, flushClickEvents } from '../src/clickhouse/client.js';
import { DEFAULT_USER_ID, DEFAULT_API_KEY } from '../src/types/models.js';

describe('ClickHouse OLAP Analytics & Telemetry Integration Tests', () => {
  let testUrlId: string;
  let testShortKey: string;
  const testTargetUrl = 'https://engineering.atspotify.com';

  beforeAll(async () => {
    // Seed test URL
    testShortKey = 'ch-' + crypto.randomBytes(4).toString('hex');
    testUrlId = crypto.randomUUID();

    const inserted = await db
      .insert(urls)
      .values({
        id: testUrlId,
        userId: DEFAULT_USER_ID,
        shortKey: testShortKey,
        originalUrl: testTargetUrl,
        title: 'Spotify Engineering Blog',
      })
      .returning({ id: urls.id, shortKey: urls.shortKey });

    testUrlId = inserted[0].id;
  });

  afterAll(async () => {
    // Clean up test events from ClickHouse
    if (testShortKey) {
      try {
        await clickhouse.command({
          query: `ALTER TABLE click_events DELETE WHERE short_key = '${testShortKey}'`,
        });
      } catch (err) {
        console.warn('Failed to clean up test click events:', err);
      }
    }
  });

  it('should asynchronously record visitor telemetry upon redirection and flush to ClickHouse', async () => {
    // 1. Send simulated visitor requests through the hot path redirect
    const res1 = await app.request(`/${testShortKey}`, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'CF-IPCountry': 'US',
        'CF-IPCity': 'San Francisco',
        Referer: 'https://news.ycombinator.com/item?id=12345',
        'X-Forwarded-For': '198.51.100.42',
      },
    });

    expect(res1.status).toBe(302);
    expect(res1.headers.get('Location')).toBe(testTargetUrl);

    // Send a second visitor from another country/device
    const res2 = await app.request(`/${testShortKey}`, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
        'CF-IPCountry': 'DE',
        'CF-IPCity': 'Berlin',
        Referer: 'https://twitter.com/post/9876',
        'X-Forwarded-For': '203.0.113.19',
      },
    });

    expect(res2.status).toBe(302);

    // Manually force batch flusher to flush in-memory queue to ClickHouse
    const flushedCount = await flushClickEvents();
    expect(flushedCount).toBeGreaterThanOrEqual(2);

    // Verify row count directly in ClickHouse
    const countRs = await clickhouse.query({
      query: `SELECT count() as cnt FROM click_events WHERE short_key = {key: String}`,
      query_params: { key: testShortKey },
    });
    const countData = await countRs.json<{ cnt: string }>();
    expect(parseInt(countData.data[0].cnt, 10)).toBeGreaterThanOrEqual(2);
  });

  it('should query multi-aggregation analytics from ClickHouse (GET /api/v1/urls/:id/analytics)', async () => {
    const res = await app.request(`/api/v1/urls/${testUrlId}/analytics`, {
      headers: {
        Authorization: `Bearer ${DEFAULT_API_KEY}`,
      },
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('ETag')).toBeDefined();

    const data = await res.json();
    expect(data.urlId).toBe(testUrlId);
    expect(data.shortKey).toBe(testShortKey);
    expect(data.totalClicks).toBeGreaterThanOrEqual(2);
    expect(data.uniqueVisitors).toBeGreaterThanOrEqual(2);

    // Breakdown validations
    expect(Array.isArray(data.timeseries)).toBe(true);
    expect(Array.isArray(data.topCountries)).toBe(true);
    expect(Array.isArray(data.topReferrers)).toBe(true);
    expect(Array.isArray(data.devices)).toBe(true);
    expect(Array.isArray(data.browsers)).toBe(true);
    expect(Array.isArray(data.operatingSystems)).toBe(true);

    const countryNames = data.topCountries.map((c: any) => c.name);
    expect(countryNames).toContain('US');
    expect(countryNames).toContain('DE');
  });

  it('should handle ETag caching with 304 Not Modified', async () => {
    // First request to obtain ETag
    const firstRes = await app.request(`/api/v1/urls/${testUrlId}/analytics`, {
      headers: {
        Authorization: `Bearer ${DEFAULT_API_KEY}`,
      },
    });
    expect(firstRes.status).toBe(200);
    const etag = firstRes.headers.get('ETag');
    expect(etag).toBeTruthy();

    // Second request with If-None-Match header
    const cachedRes = await app.request(`/api/v1/urls/${testUrlId}/analytics`, {
      headers: {
        Authorization: `Bearer ${DEFAULT_API_KEY}`,
        'If-None-Match': etag!,
      },
    });

    expect(cachedRes.status).toBe(304);
  });

  it('should reject unauthenticated requests to analytics endpoint (401 Unauthorized)', async () => {
    const res = await app.request(`/api/v1/urls/${testUrlId}/analytics`);
    expect(res.status).toBe(401);
  });
});
