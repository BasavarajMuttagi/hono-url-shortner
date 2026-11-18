import { Hono } from 'hono';
import type { AppEnv } from './types/env.js';
import { setupPipeline } from './middleware/pipeline.js';
import { authApp } from './api/auth.js';
import { urlApp } from './api/url.js';
import { analyticsApp } from './api/analytics.js';
import { redirectApp } from './api/redirect.js';
import { metricsApp } from './api/metrics.js';
import { docsApp } from './api/docs.js';
import { dashboardApp } from './views/dashboard.js';

export const app = new Hono<AppEnv>();

// 1. Global Middleware Pipeline (timing, requestId, secureHeaders, cors, bodyLimit, compression, timeout)
setupPipeline(app);

// 2. Health & System Metrics (/health, /metrics)
app.route('/', metricsApp);

// 3. Interactive OpenAPI 3.1 Swagger UI (/docs, /docs/openapi.json)
app.route('/', docsApp);

// 4. Authentication API (/api/v1/auth/register, /login, /logout, /me)
app.route('/api/v1/auth', authApp);

// 5. Columnar Analytics API (/api/v1/urls/:id/analytics)
app.route('/', analyticsApp);

// 6. URL Management API (/api/v1/urls, /api/v1/cache)
app.route('/api/v1', urlApp);

// 7. Interactive Hono JSX User Dashboard (/, /dashboard)
app.route('/', dashboardApp);

// 8. Hot-Path Visitor Redirection (/:shortKey)
app.route('/', redirectApp);

export type AppType = typeof app;
