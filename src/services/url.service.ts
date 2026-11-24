import { eq, and, desc } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import { db, urls } from '../db/index.js';
import { setCachedUrl, purgeCacheKey, purgeAnalyticsCache } from '../cache/redis.js';
import { clickhouse } from '../clickhouse/client.js';
import { generateShortKey } from '../helpers/base62.js';

export class UrlService {
  /**
   * Generates a collision-resistant 7-character Base62 key and creates a shortened URL.
   */
  static async create(userId: string, originalUrl: string, title?: string) {
    let shortKey = '';
    let attempts = 0;

    while (!shortKey && attempts < 5) {
      attempts++;
      const candidate = generateShortKey(7);
      const existing = await db
        .select({ id: urls.id })
        .from(urls)
        .where(eq(urls.shortKey, candidate))
        .limit(1);

      if (existing.length === 0) {
        shortKey = candidate;
        break;
      }
    }

    if (!shortKey) {
      throw new Error('Failed to generate a unique short key after 5 attempts');
    }

    const newId = uuidv7();
    const now = new Date();

    const [created] = await db
      .insert(urls)
      .values({
        id: newId,
        userId,
        shortKey,
        originalUrl,
        title: title || '',
        isActive: true,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    // Pre-populate Valkey cache (<1ms subsequent lookups)
    await setCachedUrl(shortKey, created.id, created.originalUrl);

    return created;
  }

  /**
   * Fetches a single URL by ID and verifies user ownership.
   */
  static async getById(id: string, userId: string) {
    const rows = await db
      .select()
      .from(urls)
      .where(and(eq(urls.id, id), eq(urls.userId, userId)))
      .limit(1);

    return rows.length > 0 ? rows[0] : null;
  }

  /**
   * Fetches a single URL by shortKey and verifies user ownership.
   */
  static async getByShortKey(shortKey: string, userId?: string) {
    const conditions = [eq(urls.shortKey, shortKey)];
    if (userId) {
      conditions.push(eq(urls.userId, userId));
    }

    const rows = await db
      .select()
      .from(urls)
      .where(and(...conditions))
      .limit(1);

    return rows.length > 0 ? rows[0] : null;
  }

  /**
   * Retrieves paginated URLs for a given user.
   */
  static async list(userId: string, page = 1, limit = 20) {
    const safePage = Math.max(1, page);
    const safeLimit = Math.min(100, Math.max(1, limit));
    const offset = (safePage - 1) * safeLimit;

    const rows = await db
      .select()
      .from(urls)
      .where(eq(urls.userId, userId))
      .orderBy(desc(urls.createdAt))
      .limit(safeLimit)
      .offset(offset);

    return {
      data: rows,
      page: safePage,
      limit: safeLimit,
      count: rows.length,
    };
  }

  /**
   * Deletes a URL, cleans up Valkey cache, and initiates background ClickHouse cleanup.
   */
  static async delete(id: string, userId: string) {
    const rows = await db
      .delete(urls)
      .where(and(eq(urls.id, id), eq(urls.userId, userId)))
      .returning({ id: urls.id, shortKey: urls.shortKey });

    if (rows.length === 0) {
      return null;
    }

    const deleted = rows[0];

    // Invalidate caches in Valkey
    await Promise.all([
      purgeCacheKey(deleted.shortKey),
      purgeAnalyticsCache(deleted.id),
    ]);

    // Clean up telemetry events in ClickHouse asynchronously
    try {
      await clickhouse.command({
        query: `ALTER TABLE click_events DELETE WHERE url_id = '${deleted.id}'`,
      });
    } catch (_err: unknown) {
      // Non-fatal if ClickHouse cleanup encounters background mutation queue
    }

    return deleted;
  }
}
