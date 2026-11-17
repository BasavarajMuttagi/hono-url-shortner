import { serve } from '@hono/node-server';
import { showRoutes } from 'hono/dev';
import { app } from './app.js';
import { env } from './config/env.js';

const port = env.PORT;

// Print registered routes on startup in development
if (env.NODE_ENV !== 'production') {
  console.log('\n🚀 Registered Routes:');
  showRoutes(app, {
    verbose: false,
  });
  console.log('');
}

console.log(`⚡ Hono server starting on port ${port} in ${env.NODE_ENV} mode...`);

serve(
  {
    fetch: app.fetch,
    port,
  },
  (info) => {
    console.log(`✨ Server is live at http://localhost:${info.port}`);
  }
);
