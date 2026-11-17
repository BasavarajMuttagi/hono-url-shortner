import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db, checkDbConnection, closeDb, users } from '../src/db/index.js';
import { eq } from 'drizzle-orm';
import {
  checkRedisConnection,
  closeRedis,
  setCachedUrl,
  getCachedUrl,
  setNegativeCache,
  purgeCacheKey,
  calculateJitteredTtl,
} from '../src/cache/redis.js';
import { DEFAULT_USER_ID, DEFAULT_API_KEY } from '../src/types/models.js';

describe('Aiven Storage Tier Integration Tests with Drizzle ORM', () => {
  beforeAll(async () => {
    // Seed default user if not already present
    await db
      .insert(users)
      .values({
        id: DEFAULT_USER_ID,
        email: 'default@shortener.local',
        apiKey: DEFAULT_API_KEY,
      })
      .onConflictDoNothing();
  });

  afterAll(async () => {
    await closeDb();
    await closeRedis();
  });

  it('should successfully connect to Aiven PostgreSQL', async () => {
    const isAlive = await checkDbConnection();
    expect(isAlive).toBe(true);
  });

  it('should query seeded default user via Drizzle ORM', async () => {
    const results = await db.select().from(users).where(eq(users.id, DEFAULT_USER_ID));
    expect(results.length).toBe(1);
    expect(results[0].email).toBe('default@shortener.local');
    expect(results[0].apiKey).toBe(DEFAULT_API_KEY);
  });

  it('should successfully connect to Aiven Valkey over TLS', async () => {
    const isAlive = await checkRedisConnection();
    expect(isAlive).toBe(true);
  });

  it('should set and get cached URL entries with jittered TTL', async () => {
    const testKey = 'testkey123';
    const testId = '01927e00-0000-7000-8000-000000000099';
    const testUrl = 'https://example.com/test-destination';

    await setCachedUrl(testKey, testId, testUrl);
    const cached = await getCachedUrl(testKey);

    expect(cached).not.toBeNull();
    expect(cached?.id).toBe(testId);
    expect(cached?.originalUrl).toBe(testUrl);
    expect(cached?.notFound).toBe(false);

    // Clean up
    await purgeCacheKey(testKey);
    const purged = await getCachedUrl(testKey);
    expect(purged).toBeNull();
  });

  it('should handle negative caching (NOT_FOUND)', async () => {
    const bogusKey = 'nonexistent-key-xyz';

    await setNegativeCache(bogusKey, 60);
    const cached = await getCachedUrl(bogusKey);

    expect(cached).not.toBeNull();
    expect(cached?.notFound).toBe(true);

    // Clean up
    await purgeCacheKey(bogusKey);
  });

  it('should calculate jittered TTL within 10% bounds', () => {
    const base = 86400; // 24 hours
    for (let i = 0; i < 50; i++) {
      const jittered = calculateJitteredTtl(base);
      expect(jittered).toBeGreaterThanOrEqual(86400 - 8640);
      expect(jittered).toBeLessThanOrEqual(86400 + 8640);
    }
  });
});
