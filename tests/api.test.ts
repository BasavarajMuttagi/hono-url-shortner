import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { app } from '../src/app.js';
import { db, closeDb, users, urls } from '../src/db/index.js';
import { closeRedis, purgeCacheKey } from '../src/cache/redis.js';
import { TEST_USER_ID, TEST_API_KEY, TEST_USER_EMAIL } from './fixtures.js';
import { eq } from 'drizzle-orm';

describe('URL Management API Integration Tests', () => {
  let createdUrlId = '';
  let createdShortKey = '';

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
  });

  afterAll(async () => {
    if (createdUrlId) {
      await db.delete(urls).where(eq(urls.id, createdUrlId));
    }
    if (createdShortKey) {
      await purgeCacheKey(createdShortKey);
    }
    await closeDb();
    await closeRedis();
  });

  it('should reject requests without Bearer token (401 Unauthorized)', async () => {
    const res = await app.request('/api/v1/urls', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ original_url: 'https://github.com/honojs/hono' }),
    });

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toContain('Unauthorized');
  });

  it('should reject invalid URL schema (400 Bad Request)', async () => {
    const res = await app.request('/api/v1/urls', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${TEST_API_KEY}`,
      },
      body: JSON.stringify({ original_url: 'not-a-valid-url' }),
    });

    expect(res.status).toBe(400);
  });

  it('should create a shortened URL (201 Created)', async () => {
    const res = await app.request('/api/v1/urls', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${TEST_API_KEY}`,
      },
      body: JSON.stringify({
        original_url: 'https://news.ycombinator.com',
        title: 'Hacker News',
      }),
    });

    expect(res.status).toBe(201);
    const body = await res.json();

    expect(body.id).toBeDefined();
    expect(body.short_key).toBeDefined();
    expect(body.short_url).toContain(body.short_key);
    expect(body.original_url).toBe('https://news.ycombinator.com');
    expect(body.title).toBe('Hacker News');

    createdUrlId = body.id;
    createdShortKey = body.short_key;
  });

  it('should retrieve URL metadata by ID (200 OK)', async () => {
    const res = await app.request(`/api/v1/urls/${createdUrlId}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${TEST_API_KEY}`,
      },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(createdUrlId);
    expect(body.short_key).toBe(createdShortKey);
    expect(body.original_url).toBe('https://news.ycombinator.com');
  });

  it('should list user URLs with pagination (200 OK)', async () => {
    const res = await app.request('/api/v1/urls?page=1&limit=10', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${TEST_API_KEY}`,
      },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.count).toBeGreaterThan(0);
  });

  it('should auto-generate collision-resistant 7-character Base62 short keys', async () => {
    const res = await app.request('/api/v1/urls', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${TEST_API_KEY}`,
      },
      body: JSON.stringify({
        original_url: 'https://hono.dev',
      }),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.short_key).toMatch(/^[0-9a-zA-Z]{7}$/);

    // Clean up
    await app.request(`/api/v1/urls/${body.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${TEST_API_KEY}` },
    });
  });

  it('should delete a URL by ID (200 OK)', async () => {
    const res = await app.request(`/api/v1/urls/${createdUrlId}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${TEST_API_KEY}`,
      },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('deleted');
    expect(body.id).toBe(createdUrlId);
  });
});
