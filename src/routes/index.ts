import { Hono } from 'hono';
import { authRouter } from './auth.js';
import { urlRouter } from './url.js';
import { analyticsRouter } from './analytics.js';
import { metricsRouter } from './metrics.js';
import { docsRouter } from './docs.js';
import { redirectRouter } from './redirect.js';
import { dashboardRouter } from '../views/dashboard.js';
import type { AppEnv } from '../types/env.js';

export const rootRouter = new Hono<AppEnv>();

/**
 * 🌲 Flat Application Router Tree:
 *
 * rootRouter (/)
 *  ├── System & Health Probes:
 *  │    ├── GET /health        (Deep healthcheck: Postgres, Valkey, ClickHouse)
 *  │    ├── GET /health/ready  (Readiness probe)
 *  │    ├── GET /health/live   (Liveness probe)
 *  │    └── GET /metrics       (Live storage telemetry & memory)
 *  │
 *  ├── Developer Documentation:
 *  │    ├── GET /docs          (Swagger UI)
 *  │    └── GET /docs/openapi.json
 *  │
 *  ├── Versioned REST API (/api/v1):
 *  │    ├── /auth              (authRouter: /register, /login, /logout, /me)
 *  │    ├── /urls              (urlRouter: POST /urls, GET /urls, GET /urls/:id, DELETE /urls/:id)
 *  │    ├── /cache             (urlRouter: DELETE /cache/:shortKey)
 *  │    └── /urls/:id/analytics (analyticsRouter: GET ClickHouse metrics)
 *  │
 *  ├── Web Dashboard & Auth Pages (/):
 *  │    ├── GET  /             (Redirects to /dashboard or /login)
 *  │    ├── GET  /login        & POST /login
 *  │    ├── GET  /register     & POST /register
 *  │    ├── GET  /dashboard    (Interactive management UI)
 *  │    └── POST /dashboard/links, /dashboard/links/:id/delete
 *  │
 *  └── Hot-Path Visitor Redirection:
 *       └── GET /:shortKey     (Sub-3ms $O(1)$ Valkey redirect)
 */

// 1. System & Health Probes
rootRouter.route('/', metricsRouter);

// 2. OpenAPI 3.1 Swagger UI
rootRouter.route('/', docsRouter);

// 3. Core REST API Endpoints
rootRouter.route('/api/v1/auth', authRouter);
rootRouter.route('/api/v1', urlRouter);
rootRouter.route('/api/v1', analyticsRouter);

// 4. Interactive JSX Web Dashboard
rootRouter.route('/', dashboardRouter);

// 5. Hot-Path Visitor Redirection
rootRouter.route('/', redirectRouter);
