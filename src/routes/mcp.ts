import { Hono } from 'hono';
import { mountInspector } from '@mcp-use/inspector';
import { mcpServer } from '../mcp/server.js';
import { env } from '../config/env.js';
import type { AppEnv } from '../types/env.js';

export const mcpRouter = new Hono<AppEnv>();

// 1. Mount MCP Inspector UI for local development only
// In production, this route is strictly disabled and unroutable (returns 404)
if (env.NODE_ENV !== 'production') {
  mountInspector(mcpRouter, { basePath: '/mcp' });
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
