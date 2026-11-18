// Must be the first import to patch HTTP/DB modules before they load
import './instrumentation.js';
import { shutdownOtel } from './instrumentation.js';

import { serve } from '@hono/node-server';
import { showRoutes } from 'hono/dev';
import { app } from './app.js';
import { env } from './config/env.js';
import { checkDbConnection, closeDb } from './db/index.js';
import { checkRedisConnection, closeRedis } from './cache/redis.js';
import { clickhouse, startBatchFlusher, closeClickHouse } from './clickhouse/client.js';

const port = env.PORT;

/**
 * Validates connectivity to PostgreSQL, Valkey, and ClickHouse in parallel.
 * Fails fast on invalid credentials or unreachable networks before binding the port.
 */
async function initServices(): Promise<void> {
  const [dbOk, redisOk, chPing] = await Promise.all([
    checkDbConnection(),
    checkRedisConnection(),
    clickhouse
      .ping()
      .then((r) => r.success)
      .catch(() => false),
  ]);

  const failedServices = [
    !dbOk && 'PostgreSQL',
    !redisOk && 'Valkey/Redis',
    !chPing && 'ClickHouse',
  ].filter(Boolean) as string[];

  if (failedServices.length > 0) {
    throw new Error(`Failed to connect to backing service(s): ${failedServices.join(', ')}`);
  }
}

async function bootstrap() {
  // 1. Establish and verify connections to all backing services in parallel
  console.log('⏳ Connecting to Aiven storage tier (Postgres, Valkey, ClickHouse)...');
  await initServices();
  console.log('✅ All backing services connected successfully');

  // 2. Start background batch flusher for click telemetry
  startBatchFlusher();

  // 3. Print registered routes in development mode
  if (env.NODE_ENV === 'development') {
    console.log('\n🚀 Registered Routes:');
    showRoutes(app, { verbose: false });
    console.log('');
  }

  // 4. Start HTTP Server
  const server = serve(
    {
      fetch: app.fetch,
      port,
    },
    (info) => {
      console.log(`✨ Server is live at http://localhost:${info.port} (${env.NODE_ENV})`);
    }
  );

  // Configure Keep-Alive timeouts for reverse proxies and GCP Cloud Load Balancing
  // GCP LB idle backend timeout is 600s (10 minutes).
  // Node's keepAliveTimeout must exceed GCP LB timeout to avoid intermittent 502 Bad Gateway errors.
  if ('keepAliveTimeout' in server) {
    (server as unknown as { keepAliveTimeout: number; headersTimeout: number }).keepAliveTimeout = 620 * 1000;
    (server as unknown as { keepAliveTimeout: number; headersTimeout: number }).headersTimeout = 650 * 1000;
  }

  // 5. Graceful shutdown handler
  const shutdown = async (signal: string) => {
    console.log(`\n🛑 Received ${signal}. Shutting down gracefully...`);
    server.close();
    await Promise.allSettled([
      closeDb(),
      closeRedis(),
      closeClickHouse(),
      shutdownOtel(),
    ]);
    console.log('👋 Clean shutdown complete. Goodbye!');
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

bootstrap().catch((err) => {
  console.error('❌ Bootstrap failure:', err.message || err);
  process.exit(1);
});
