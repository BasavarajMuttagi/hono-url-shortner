import { db, users, urls, closeDb } from './index.js';
import { clickhouse } from '../clickhouse/client.js';
import { redis, closeRedis } from '../cache/redis.js';
import { sql } from 'drizzle-orm';

async function cleanupAll() {
  console.log('🧹 Starting full database, ClickHouse, and Valkey cleanup...');

  // 1. PostgreSQL Cleanup
  console.log('1️⃣ Cleaning PostgreSQL...');
  // Delete all test URLs
  const deletedUrls = await db.execute(sql`
    DELETE FROM urls 
    WHERE short_key LIKE 'redir-%'
       OR short_key LIKE 'ch-%'
       OR short_key LIKE 'stress-%'
       OR short_key LIKE 'k6%'
       OR short_key LIKE 'mix-%'
       OR short_key LIKE 'stampede-%'
       OR short_key = 'axiom-docs';
  `);
  console.log(`   ✅ Deleted test URLs from PostgreSQL`);

  // Delete all load test and test users (keeping only the seeded user and real users)
  const deletedUsers = await db.execute(sql`
    DELETE FROM users 
    WHERE email LIKE 'loaduser_%'
       OR email LIKE 'user_%'
       OR email = 'test@example.com';
  `);
  console.log(`   ✅ Deleted test/load users from PostgreSQL`);

  // 2. ClickHouse Cleanup
  console.log('2️⃣ Cleaning ClickHouse click_events...');
  try {
    await clickhouse.command({ query: 'TRUNCATE TABLE click_events' });
    console.log('   ✅ Truncated ClickHouse click_events table (0 events remaining)');
  } catch (err) {
    console.warn('   ⚠️ Failed to truncate ClickHouse, attempting ALTER DELETE:', err);
    await clickhouse.command({
      query: `ALTER TABLE click_events DELETE WHERE 1=1`,
    });
  }

  // 3. Valkey (Redis) Cleanup
  console.log('3️⃣ Cleaning Valkey (Redis) cache...');
  try {
    const keys = await redis.keys('url:*');
    const authKeys = await redis.keys('auth:*');
    const allKeys = [...keys, ...authKeys];
    if (allKeys.length > 0) {
      await redis.del(...allKeys);
      console.log(`   ✅ Removed ${allKeys.length} cached keys from Valkey`);
    } else {
      console.log('   ✅ Valkey is already clean');
    }
  } catch (err) {
    console.warn('   ⚠️ Failed to clean Valkey keys:', err);
  }

  // 4. Verification summary
  const remainingUrls = await db.select({ count: sql`count(*)` }).from(urls);
  const remainingUsers = await db.select({ count: sql`count(*)` }).from(users);
  const chStats = await clickhouse.query({ query: 'SELECT count() as total FROM click_events' });
  const chJson = await chStats.json<{ total: string }>();

  console.log('\n📊 Post-Cleanup Status:');
  console.log(`   • PostgreSQL URLs remaining: ${(remainingUrls[0] as any).count}`);
  console.log(`   • PostgreSQL Users remaining: ${(remainingUsers[0] as any).count}`);
  console.log(`   • ClickHouse Events remaining: ${chJson.data[0]?.total || 0}`);

  await closeDb();
  await closeRedis();
  console.log('✨ Full database cleanup completed successfully!\n');
}

cleanupAll().catch((err) => {
  console.error('❌ Cleanup failed:', err);
  process.exit(1);
});
