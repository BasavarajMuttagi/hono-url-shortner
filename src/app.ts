import { Hono } from 'hono';
import { logger } from 'hono/logger';
import type { AppEnv } from './types/env.js';
import { env } from './config/env.js';

export const app = new Hono<AppEnv>();

// Conditional dev logger
if (env.NODE_ENV !== 'production') {
  app.use('*', logger());
}

// Health check endpoint
app.get('/health', (c) => {
  return c.json({
    status: 'healthy',
    environment: env.NODE_ENV,
    timestamp: new Date().toISOString(),
  });
});

export type AppType = typeof app;
