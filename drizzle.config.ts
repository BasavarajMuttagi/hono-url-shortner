import { defineConfig } from 'drizzle-kit';
import dotenv from 'dotenv';

dotenv.config();

const cleanUrl = (process.env.DATABASE_URL || '').replace(/[?&]sslmode=[^&]+/, '');

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: cleanUrl,
    ssl: { rejectUnauthorized: false },
  },
});
