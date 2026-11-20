import { Hono } from 'hono';
import type { AppEnv } from './types/env.js';
import { setupAppMiddleware } from './middleware/app-middleware.js';
import { rootRouter } from './routes/index.js';

export const app = new Hono<AppEnv>();

// 1. Mount Application Middleware (logger, requestId, timing, secureHeaders, cors, compress, prettyJSON, bodyLimit, timeout)
setupAppMiddleware(app);

// 2. Global Error Boundary with Request ID correlation
app.onError((err, c) => {
  const reqId = c.get('requestId') || 'unknown';
  console.error(`❌ [${reqId}] Unhandled Application Error:`, err);
  return c.json(
    {
      error: 'Internal Server Error',
      message: err.message || 'An unexpected error occurred',
      requestId: reqId,
    },
    500
  );
});

// 3. Mount Application Router Tree
app.route('/', rootRouter);

export type AppType = typeof app;
