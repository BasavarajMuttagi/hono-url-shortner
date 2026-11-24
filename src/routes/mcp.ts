import { Hono } from 'hono';
import { mcpServer } from '../mcp/server.js';
import { env } from '../config/env.js';
import type { AppEnv } from '../types/env.js';

export const mcpRouter = new Hono<AppEnv>();

// 1. Mount MCP Inspector UI for local development only
// In production, this route is strictly disabled and unroutable (returns 404)
if (env.NODE_ENV !== 'production') {
  try {
    const { mountInspector } = await import('@mcp-use/inspector');
    mountInspector(mcpRouter, { basePath: '/mcp' });
  } catch {
    // Inspector is a devDependency and not available in production builds
  }
} else {
  mcpRouter.all('/mcp/inspector', (c) => c.text('Not Found', 404));
  mcpRouter.all('/mcp/inspector/*', (c) => c.text('Not Found', 404));
}

// 2. Delegate MCP protocol requests to mcpServer (enforces mcpAuthGuard)
mcpRouter.all('/mcp', async (c) => {
  return mcpServer.fetch(c.req.raw);
});

mcpRouter.all('/mcp/*', async (c) => {
  return mcpServer.fetch(c.req.raw);
});
