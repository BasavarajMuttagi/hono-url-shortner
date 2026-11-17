import { createClient, type ClickHouseClient } from '@clickhouse/client';
import { env } from '../config/env.js';
import type { ClickEvent } from '../types/models.js';

export const clickhouse: ClickHouseClient = createClient({
  url: env.CLICKHOUSE_URL,
  username: env.CLICKHOUSE_USER,
  password: env.CLICKHOUSE_PASSWORD,
  database: env.CLICKHOUSE_DB,
  request_timeout: 10000,
});

const BATCH_SIZE_THRESHOLD = 500;
const FLUSH_INTERVAL_MS = 1000;

let clickBuffer: ClickEvent[] = [];
let flushTimer: NodeJS.Timeout | null = null;
let isFlushing = false;

/**
 * Initializes the ClickHouse schema (idempotent).
 */
export async function initClickHouse(): Promise<void> {
  await clickhouse.command({
    query: `
      CREATE TABLE IF NOT EXISTS click_events (
        url_id UUID,
        short_key LowCardinality(String),
        timestamp DateTime64(3, 'UTC'),
        ip_hash FixedString(64),
        country LowCardinality(String),
        city String,
        browser LowCardinality(String),
        os LowCardinality(String),
        device_type LowCardinality(String),
        referrer String
      ) ENGINE = MergeTree()
      PARTITION BY toYYYYMM(timestamp)
      ORDER BY (url_id, timestamp)
      SETTINGS index_granularity = 8192;
    `,
  });

  startBatchFlusher();
}

/**
 * Starts the periodic background flush timer.
 */
export function startBatchFlusher(): void {
  if (flushTimer) return;
  flushTimer = setInterval(() => {
    flushClickEvents().catch((err) => {
      console.error('ClickHouse periodic flush failed:', err);
    });
  }, FLUSH_INTERVAL_MS);
  // Ensure the timer doesn't prevent Node.js from exiting cleanly
  flushTimer.unref();
}

/**
 * Enqueues a click event into the memory buffer.
 * If buffer reaches threshold, triggers an immediate asynchronous flush.
 */
export function recordClickEvent(event: ClickEvent): void {
  clickBuffer.push(event);

  if (clickBuffer.length >= BATCH_SIZE_THRESHOLD) {
    setImmediate(() => {
      flushClickEvents().catch((err) => {
        console.error('ClickHouse threshold flush failed:', err);
      });
    });
  }
}

/**
 * Flushes all pending click events in the buffer to ClickHouse in a single batch.
 */
export async function flushClickEvents(): Promise<number> {
  if (clickBuffer.length === 0 || isFlushing) {
    return 0;
  }

  isFlushing = true;
  const eventsToInsert = clickBuffer;
  clickBuffer = [];

  try {
    await clickhouse.insert({
      table: 'click_events',
      values: eventsToInsert,
      format: 'JSONEachRow',
    });
    return eventsToInsert.length;
  } catch (error) {
    console.error(`Failed to flush ${eventsToInsert.length} click events to ClickHouse:`, error);
    // Put events back in buffer on error to prevent data loss (prepend)
    clickBuffer = [...eventsToInsert, ...clickBuffer];
    throw error;
  } finally {
    isFlushing = false;
  }
}

/**
 * Gracefully flushes remaining events and terminates the ClickHouse client.
 */
export async function closeClickHouse(): Promise<void> {
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
  try {
    await flushClickEvents();
  } catch (err) {
    console.error('Error during final ClickHouse flush:', err);
  }
  await clickhouse.close();
}
