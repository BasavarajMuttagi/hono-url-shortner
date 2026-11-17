import { Hono } from 'hono';
import { Layout } from './layout.js';
import type { AppEnv } from '../types/env.js';

export const dashboardApp = new Hono<AppEnv>();

dashboardApp.get('/dashboard', (c) => {
  return c.html(
    <Layout title="Dashboard — Hono Shortener">
      <div class="min-h-screen flex items-center justify-center text-zinc-500 font-mono text-xs">
        Loading Hono Shortener...
      </div>
    </Layout>
  );
});

dashboardApp.get('/', (c) => {
  return c.html(
    <Layout title="Dashboard — Hono Shortener">
      <div class="min-h-screen flex items-center justify-center text-zinc-500 font-mono text-xs">
        Loading Hono Shortener...
      </div>
    </Layout>
  );
});
