import { Hono } from 'hono';
import type { AppEnv } from './types/env.js';
import { setupPipeline } from './middleware/pipeline.js';
import { rootRouter } from './routes/index.js';

export const app = new Hono<AppEnv>();

// 1. Global Middleware Pipeline (timing, requestId, secureHeaders, cors, bodyLimit, compression, timeout)
setupPipeline(app);

// 2. Global Error Boundary
app.onError((err, c) => {
  console.error('❌ Unhandled Application Error:', err);
  return c.json(
    {
      error: 'Internal Server Error',
      message: err.message || 'An unexpected error occurred',
    },
    500
  );
});

// 3. Mount Application Router Tree
app.route('/', rootRouter);

export type AppType = typeof app;
