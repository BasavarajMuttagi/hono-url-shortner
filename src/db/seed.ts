import { db, users, closeDb } from './index.js';
import { env } from '../config/env.js';

const SEED_USER_ID = env.SEED_USER_ID;
const SEED_API_KEY = env.SEED_API_KEY;
const SEED_EMAIL = env.SEED_USER_EMAIL;

async function seed() {
  console.log(`🌱 Seeding development user (${SEED_EMAIL})...`);
  await db
    .insert(users)
    .values({
      id: SEED_USER_ID,
      email: SEED_EMAIL,
      apiKey: SEED_API_KEY,
    })
    .onConflictDoUpdate({
      target: users.id,
      set: { apiKey: SEED_API_KEY, email: SEED_EMAIL },
    });
  console.log('✅ Seeding completed successfully');
  await closeDb();
}

seed().catch((err) => {
  console.error('❌ Seeding failed:', err);
  process.exit(1);
});
