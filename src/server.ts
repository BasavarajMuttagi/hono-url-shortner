import { serve } from '@hono/node-server';
import { showRoutes } from 'hono/dev';
import { app } from './app.js';
import { env } from './config/env.js';
import { db, users, checkDbConnection, closeDb } from './db/index.js';
import { checkRedisConnection, closeRedis } from './cache/redis.js';
import { DEFAULT_USER_ID, DEFAULT_API_KEY } from './types/models.js';

const port = env.PORT;

async function bootstrap() {
  console.log('⏳ Connecting to Aiven PostgreSQL...');
  const dbOk = await checkDbConnection();
  if (!dbOk) {
    console.error('❌ Could not connect to PostgreSQL. Aborting.');
    process.exit(1);
  }
  console.log('✅ PostgreSQL connected successfully');

  // Ensure default seed user exists using Drizzle ORM
  await db
    .insert(users)
    .values({
      id: DEFAULT_USER_ID,
      email: 'default@shortener.local',
      apiKey: DEFAULT_API_KEY,
    })
    .onConflictDoNothing();

  console.log('⏳ Connecting to Aiven Valkey over TLS...');
  const redisOk = await checkRedisConnection();
  if (!redisOk) {
    console.warn('⚠️ Could not connect to Valkey. Caching will be degraded.');
  } else {
    console.log('✅ Valkey connected successfully');
  }

  // Print registered routes on startup in development
  if (env.NODE_ENV !== 'production') {
    console.log('\n🚀 Registered Routes:');
    showRoutes(app, { verbose: false });
    console.log('');
  }

  console.log(`⚡ Hono server starting on port ${port} in ${env.NODE_ENV} mode...`);

  const server = serve(
    {
      fetch: app.fetch,
      port,
    },
    (info) => {
      console.log(`✨ Server is live at http://localhost:${info.port}`);
    }
  );

  // Graceful shutdown
  const shutdown = async () => {
    console.log('\n🛑 Shutting down gracefully...');
    server.close();
    await closeDb();
    await closeRedis();
    console.log('👋 Goodbye!');
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

bootstrap().catch((err) => {
  console.error('❌ Bootstrap failure:', err);
  process.exit(1);
});
