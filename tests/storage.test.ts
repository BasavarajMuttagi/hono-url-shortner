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
import { TEST_USER_ID, TEST_API_KEY, TEST_USER_EMAIL } from './fixtures.js';

describe('Aiven Storage Tier Integration Tests with Drizzle ORM', () => {
  beforeAll(async () => {
    // Seed default user if not already present
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
    const results = await db.select().from(users).where(eq(users.id, TEST_USER_ID));
    expect(results.length).toBe(1);
    expect(results[0].email).toBe(TEST_USER_EMAIL);
    expect(results[0].apiKey).toBe(TEST_API_KEY);
  });

  it('should successfully connect to Aiven Valkey over TLS', async () => {
    const isAlive = await checkRedisConnection();
    expect(isAlive).toBe(true);
  });

  it('should set and get cached URL entries with jittered TTL', async () => {
    const testKey = 'testkey123';
    const testId = crypto.randomUUID();
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
