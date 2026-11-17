import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'path';

// Explicitly load .env from project root
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const envSchema = z.object({
  PORT: z.coerce.number().default(8080),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  BASE_URL: z.string().min(1).default('http://localhost:8080'),

  // Aiven PostgreSQL
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  // Aiven Valkey / Redis
  REDIS_URL: z.string().min(1, 'REDIS_URL is required'),

  // Aiven ClickHouse
  CLICKHOUSE_URL: z.string().min(1, 'CLICKHOUSE_URL is required'),
  CLICKHOUSE_USER: z.string().default('default'),
  CLICKHOUSE_PASSWORD: z.string().default(''),
  CLICKHOUSE_DB: z.string().default('default'),

  // Privacy Salt
  SALT_SECRET: z.string().min(16, 'SALT_SECRET must be at least 16 characters long'),

  // JWT Secret for Cookie & Token authentication
  JWT_SECRET: z
    .string()
    .min(16, 'JWT_SECRET must be at least 16 characters long')
    .default('super-secret-jwt-signing-key-for-url-shortener-2026'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:', parsed.error.format());
  process.exit(1);
}

export const env = parsed.data;
export type EnvConfig = z.infer<typeof envSchema>;
