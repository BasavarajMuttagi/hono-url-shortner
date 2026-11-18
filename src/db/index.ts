import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema.js';
import { env } from '../config/env.js';

const { Pool } = pg;

// Strip sslmode from query string so pg respects our explicit ssl config
const cleanConnectionString = env.DATABASE_URL.replace(/[?&]sslmode=[^&]+/, '');

export const pool = new Pool({
  connectionString: cleanConnectionString,
  max: 10, // Tuned for Aiven PostgreSQL connection ceiling (leaves headroom for tests/scripts)
  idleTimeoutMillis: 5000,
  connectionTimeoutMillis: 10000,
  ssl: {
    rejectUnauthorized: false,
  },
});

pool.on('error', (err) => {
  console.error('⚠️ Unexpected PostgreSQL pool error:', err);
});

// Type-safe Drizzle client instance
export const db = drizzle(pool, { schema });

export async function checkDbConnection(): Promise<boolean> {
  try {
    const res = await pool.query('SELECT 1 as alive;');
    return res.rows[0]?.alive === 1;
  } catch (err) {
    console.error('❌ Failed to connect to PostgreSQL:', err);
    return false;
  }
}

export async function closeDb(): Promise<void> {
  await pool.end();
}

export * from './schema.js';
