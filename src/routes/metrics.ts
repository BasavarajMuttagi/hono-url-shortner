import { Hono } from 'hono';
import { sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { redis } from '../cache/redis.js';
import { clickhouse } from '../clickhouse/client.js';
import { env } from '../config/env.js';
import type { AppEnv } from '../types/env.js';

export const metricsRouter = new Hono<AppEnv>();

// 5-second in-memory cache to prevent connection pool exhaustion during rapid healthcheck probes
let cachedHealthResult: { isHealthy: boolean; services: { postgres: string; valkey: string; clickhouse: string } } | null = null;
let lastHealthCheckTime = 0;
const HEALTH_CACHE_TTL_MS = 5000;

/**
 * Validates backing service connectivity in parallel with 5s caching.
 */
async function checkServicesHealth() {
  const now = Date.now();
  if (cachedHealthResult && now - lastHealthCheckTime < HEALTH_CACHE_TTL_MS) {
    return cachedHealthResult;
  }

  const [dbOk, redisOk, chOk] = await Promise.all([
    db
      .execute(sql`SELECT 1`)
      .then(() => true)
      .catch(() => false),
    redis
      .ping()
      .then((p) => p === 'PONG')
      .catch(() => false),
    clickhouse
      .ping()
      .then((r) => r.success)
      .catch(() => false),
  ]);

  cachedHealthResult = {
    isHealthy: dbOk && redisOk && chOk,
    services: {
      postgres: dbOk ? 'up' : 'down',
      valkey: redisOk ? 'up' : 'down',
      clickhouse: chOk ? 'up' : 'down',
    },
  };
  lastHealthCheckTime = now;

  return cachedHealthResult;
}

/**
 * 1. Deep Readiness Health Check (GET /health & GET /health/ready)
 * Verifies Postgres, Valkey, and ClickHouse. Returns 503 if any service drops.
 */
metricsRouter.get('/health', async (c) => {
  const { isHealthy, services } = await checkServicesHealth();
  const statusCode = isHealthy ? 200 : 503;

  return c.json(
    {
      status: isHealthy ? 'healthy' : 'unhealthy',
      environment: env.NODE_ENV,
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      services,
    },
    statusCode
  );
});

metricsRouter.get('/health/ready', async (c) => {
  const { isHealthy, services } = await checkServicesHealth();
  return c.json(
    {
      status: isHealthy ? 'healthy' : 'unhealthy',
      services,
    },
    isHealthy ? 200 : 503
  );
});

/**
 * 2. Shallow Liveness Health Check (GET /health/live)
 * Pure event loop check for Kubernetes livenessProbe.
 */
metricsRouter.get('/health/live', (c) => {
  return c.json({
    status: 'alive',
    uptimeSeconds: Math.floor(process.uptime()),
  });
});

/**
 * 3. Detailed Telemetry & Metrics (GET /metrics)
 */
metricsRouter.get('/metrics', async (c) => {
  // Check PostgreSQL latency
  const pgStart = performance.now();
  let pgStatus = 'down';
  let pgLatencyMs = 0;
  try {
    await db.execute(sql`SELECT 1`);
    pgLatencyMs = Math.round((performance.now() - pgStart) * 100) / 100;
    pgStatus = 'up';
  } catch {
    pgStatus = 'down';
  }

  // Check Valkey latency
  const valkeyStart = performance.now();
  let valkeyStatus = 'down';
  let valkeyLatencyMs = 0;
  try {
    const pong = await redis.ping();
    if (pong === 'PONG') {
      valkeyLatencyMs = Math.round((performance.now() - valkeyStart) * 100) / 100;
      valkeyStatus = 'up';
    }
  } catch {
    valkeyStatus = 'down';
  }

  // Check ClickHouse latency
  const chStart = performance.now();
  let chStatus = 'down';
  let chLatencyMs = 0;
  try {
    const rs = await clickhouse.query({ query: 'SELECT 1' });
    await rs.json();
    chLatencyMs = Math.round((performance.now() - chStart) * 100) / 100;
    chStatus = 'up';
  } catch {
    chStatus = 'down';
  }

  const mem = process.memoryUsage();

  return c.json({
    status: pgStatus === 'up' && valkeyStatus === 'up' && chStatus === 'up' ? 'healthy' : 'degraded',
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    memory: {
      rssMb: Math.round((mem.rss / 1024 / 1024) * 100) / 100,
      heapUsedMb: Math.round((mem.heapUsed / 1024 / 1024) * 100) / 100,
      heapTotalMb: Math.round((mem.heapTotal / 1024 / 1024) * 100) / 100,
    },
    services: {
      postgres: { status: pgStatus, latencyMs: pgLatencyMs },
      valkey: { status: valkeyStatus, latencyMs: valkeyLatencyMs },
      clickhouse: { status: chStatus, latencyMs: chLatencyMs },
    },
  });
});
