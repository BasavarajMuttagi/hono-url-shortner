import { db, users, closeDb } from './index.js';
import { DEFAULT_USER_ID, DEFAULT_API_KEY } from '../types/models.js';

async function seed() {
  console.log('🌱 Seeding default user...');
  await db
    .insert(users)
    .values({
      id: DEFAULT_USER_ID,
      email: 'default@shortener.local',
      apiKey: DEFAULT_API_KEY,
    })
    .onConflictDoNothing();
  console.log('✅ Seeding completed successfully');
  await closeDb();
}

seed().catch((err) => {
  console.error('❌ Seeding failed:', err);
  process.exit(1);
});
