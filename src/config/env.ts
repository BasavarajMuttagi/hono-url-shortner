import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'path';

// Explicitly load .env from project root
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const envSchema = z.object({
  PORT: z.coerce.number().min(1, 'PORT is required'),
  NODE_ENV: z.enum(['development', 'production', 'test']),
  BASE_URL: z.string().min(1, 'BASE_URL is required'),

  // Aiven PostgreSQL
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  // Aiven Valkey / Redis
  REDIS_URL: z.string().min(1, 'REDIS_URL is required'),

  // Aiven ClickHouse
  CLICKHOUSE_URL: z.string().min(1, 'CLICKHOUSE_URL is required'),
  CLICKHOUSE_USER: z.string().min(1, 'CLICKHOUSE_USER is required'),
  CLICKHOUSE_PASSWORD: z.string(),
  CLICKHOUSE_DB: z.string().min(1, 'CLICKHOUSE_DB is required'),

  // Privacy Salt
  SALT_SECRET: z.string().min(16, 'SALT_SECRET must be at least 16 characters long'),

  // JWT Secret for Cookie & Token authentication
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters long'),

  // Development & Testing Seed Credentials (Imported purely from env)
  SEED_USER_ID: z.string().min(1, 'SEED_USER_ID is required'),
  SEED_USER_EMAIL: z.string().email('SEED_USER_EMAIL must be a valid email'),
  SEED_API_KEY: z.string().min(16, 'SEED_API_KEY must be at least 16 characters long'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:', parsed.error.format());
  process.exit(1);
}

export const env = parsed.data;
export type EnvConfig = z.infer<typeof envSchema>;
