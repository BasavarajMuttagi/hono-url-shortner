import { Hono } from 'hono';
import { authRouter } from './auth.js';
import { urlRouter } from './url.js';
import { analyticsRouter } from './analytics.js';
import type { AppEnv } from '../../types/env.js';

export const apiRouter = new Hono<AppEnv>();

// 1. Authentication Router (/api/v1/auth/*)
apiRouter.route('/auth', authRouter);

// 2. URL Management Router (/api/v1/urls/*, /api/v1/cache/*)
apiRouter.route('/', urlRouter);

// 3. ClickHouse Columnar Analytics Router (/api/v1/urls/:id/analytics)
apiRouter.route('/', analyticsRouter);
