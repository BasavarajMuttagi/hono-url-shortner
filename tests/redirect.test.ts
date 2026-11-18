import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { app } from '../src/app.js';
import { db, closeDb, users, urls } from '../src/db/index.js';
import { closeRedis, purgeCacheKey, getCachedUrl } from '../src/cache/redis.js';
import { TEST_USER_ID, TEST_API_KEY, TEST_USER_EMAIL } from './fixtures.js';
import crypto from 'node:crypto';
import { v7 as uuidv7 } from 'uuid';
import { eq } from 'drizzle-orm';

describe('Hot-Path Visitor Redirection Integration Tests', () => {
  const testKey = 'redir-' + crypto.randomBytes(4).toString('hex');
  const targetUrl = 'https://docs.aiven.io';
  const testId = uuidv7();

  beforeAll(async () => {
    // Seed default user
    await db
      .insert(users)
      .values({
        id: TEST_USER_ID,
        email: TEST_USER_EMAIL,
        apiKey: TEST_API_KEY,
      })
      .onConflictDoUpdate({
        target: users.id,
        set: { apiKey: TEST_API_KEY, email: TEST_USER_EMAIL },
      });

    // Insert test URL
    await db
      .insert(urls)
      .values({
        id: testId,
        userId: TEST_USER_ID,
        shortKey: testKey,
        originalUrl: targetUrl,
        title: 'Aiven Docs',
        isActive: true,
      })
      .onConflictDoNothing();
  });

  afterAll(async () => {
    await db.delete(urls).where(eq(urls.id, testId));
    await purgeCacheKey(testKey);
    await closeDb();
    await closeRedis();
  });

  it('should redirect with HTTP 302 and Location header', async () => {
    const res = await app.request(`/${testKey}`, {
      method: 'GET',
    });

    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe(targetUrl);

    // Verify key was backfilled into Valkey cache
    const cached = await getCachedUrl(testKey);
    expect(cached).not.toBeNull();
    expect(cached?.id).toBe(testId);
    expect(cached?.originalUrl).toBe(targetUrl);
  });

  it('should serve subsequent redirects from Valkey memory cache', async () => {
    const res = await app.request(`/${testKey}`, {
      method: 'GET',
    });

    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe(targetUrl);

    // Verify it is served directly from Valkey cache
    const cached = await getCachedUrl(testKey);
    expect(cached).not.toBeNull();
    expect(cached?.id).toBe(testId);
    expect(cached?.originalUrl).toBe(targetUrl);
  });

  it('should return 404 for non-existent keys and trigger negative caching', async () => {
    const nonexistentKey = 'ghost-' + crypto.randomBytes(4).toString('hex');

    // First call: DB lookup -> negative cache set
    const res1 = await app.request(`/${nonexistentKey}`, { method: 'GET' });
    expect(res1.status).toBe(404);

    // Verify negative cache entry exists in Valkey
    const cached = await getCachedUrl(nonexistentKey);
    expect(cached?.notFound).toBe(true);

    // Second call: Instant negative cache hit
    const res2 = await app.request(`/${nonexistentKey}`, { method: 'GET' });
    expect(res2.status).toBe(404);

    // Clean up
    await purgeCacheKey(nonexistentKey);
  });

  it('should support purging cache keys via DELETE /api/v1/cache/:shortKey', async () => {
    const purgeRes = await app.request(`/api/v1/cache/${testKey}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${TEST_API_KEY}`,
      },
    });

    expect(purgeRes.status).toBe(200);
    const body = await purgeRes.json();
    expect(body.status).toBe('purged');
    expect(body.key).toBe(testKey);

    // Verify cache key was removed from Valkey
    const cached = await getCachedUrl(testKey);
    expect(cached).toBeNull();
  });
});
