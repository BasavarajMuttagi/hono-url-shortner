import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { app } from '../src/app.js';
import { db, closeDb, users } from '../src/db/index.js';
import { closeRedis, redis } from '../src/cache/redis.js';
import { eq } from 'drizzle-orm';
import crypto from 'node:crypto';
import { sign } from 'hono/jwt';
import { env } from '../src/config/env.js';

describe('Strict OAuth 2.1 MCP Server & Security Tests', () => {
  const testEmail = `mcp_user_${crypto.randomBytes(4).toString('hex')}@shortener.local`;
  const testPassword = 'Password123!';
  let apiKey = '';
  let jwtToken = '';
  let oauthToken = '';

  beforeAll(async () => {
    // Register user to obtain API key and JWT
    const res = await app.request('/api/v1/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testEmail, password: testPassword }),
    });

    const body = await res.json();
    apiKey = body.user.api_key;
    jwtToken = body.token;

    // Generate valid OAuth 2.1 access token with mcp:tools scope
    oauthToken = await sign(
      { sub: body.user.id, scope: 'mcp:tools' },
      env.JWT_SECRET,
      'HS256'
    );
  });

  afterAll(async () => {
    await db.delete(users).where(eq(users.email, testEmail));
    await closeDb();
    await closeRedis();
  });

  it('should serve the MCP Inspector UI at /mcp/inspector in development', async () => {
    const res = await app.request('/mcp/inspector');
    expect(res.status).toBe(200);
    const contentType = res.headers.get('content-type');
    expect(contentType).toContain('text/html');
  });

  it('should reject unauthenticated POST /mcp requests with RFC 9728 challenge', async () => {
    const res = await app.request('/mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
        params: {},
      }),
    });

    expect(res.status).toBe(401);
    const wwwAuth = res.headers.get('www-authenticate') || '';
    expect(wwwAuth).toContain('resource_metadata');
  });

  it('should reject POST /mcp requests that only send web cookies (strict Bearer token isolation)', async () => {
    const res = await app.request('/mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
        'Cookie': `auth_token=${jwtToken}`,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
        params: {},
      }),
    });

    expect(res.status).toBe(401);
  });

  it('should reject static API keys on /mcp (strict OAuth 2.1 enforcement)', async () => {
    const res = await app.request('/mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
        params: {},
      }),
    });

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('invalid_token');
  });

  it('should reject Bearer tokens missing required mcp:tools scope with 403 insufficient_scope', async () => {
    const res = await app.request('/mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
        'Authorization': `Bearer ${jwtToken}`,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
        params: {},
      }),
    });

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('insufficient_scope');
    const wwwAuth = res.headers.get('www-authenticate') || '';
    expect(wwwAuth).toContain('error="insufficient_scope"');
    expect(wwwAuth).toContain('scope="mcp:tools"');
  });

  it('should list available MCP tools for an authenticated OAuth 2.1 Bearer token', async () => {
    const res = await app.request('/mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
        'Authorization': `Bearer ${oauthToken}`,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
        params: {},
      }),
    });

    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain('shorten_url');
    expect(text).toContain('list_my_urls');
    expect(text).toContain('get_url_details');
    expect(text).toContain('get_url_analytics');
    expect(text).toContain('delete_url');
  });

  let createdShortKey = '';

  it('should execute shorten_url tool via OAuth 2.1 authenticated MCP protocol', async () => {
    const res = await app.request('/mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
        'Authorization': `Bearer ${oauthToken}`,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: 'shorten_url',
          arguments: {
            original_url: 'https://docs.mcp-use.com/typescript/server/middleware',
            title: 'MCP Use Middleware Documentation',
          },
        },
      }),
    });

    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain('URL shortened successfully');
    expect(text).toContain('short_key');

    // Parse MCP SSE JSON-RPC response to extract short_key
    const dataLine = text.split('\n').find((l) => l.startsWith('data: '));
    if (dataLine) {
      const parsed = JSON.parse(dataLine.replace('data: ', ''));
      const inner = JSON.parse(parsed.result.content[0].text);
      createdShortKey = inner.short_key;
    }
  });

  it('should execute get_url_details tool via OAuth 2.1 authenticated MCP protocol', async () => {
    expect(createdShortKey).toBeTruthy();
    const res = await app.request('/mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
        'Authorization': `Bearer ${oauthToken}`,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: {
          name: 'get_url_details',
          arguments: {
            identifier: createdShortKey,
          },
        },
      }),
    });

    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain('docs.mcp-use.com');
    expect(text).toContain(createdShortKey);
  });

  it('should execute list_my_urls tool returning total and has_more pagination metadata', async () => {
    const res = await app.request('/mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
        'Authorization': `Bearer ${oauthToken}`,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/call',
        params: {
          name: 'list_my_urls',
          arguments: {
            page: 1,
            limit: 5,
          },
        },
      }),
    });

    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain('total');
    expect(text).toContain('has_more');
    expect(text).toContain('limit');
  });

  it('should execute delete_url tool via OAuth 2.1 authenticated MCP protocol', async () => {
    expect(createdShortKey).toBeTruthy();
    const res = await app.request('/mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
        'Authorization': `Bearer ${oauthToken}`,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/call',
        params: {
          name: 'delete_url',
          arguments: {
            identifier: createdShortKey,
          },
        },
      }),
    });

    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain('URL deleted successfully');
  });

  it('should rotate API key via POST /api/v1/auth/rotate-key', async () => {
    const res = await app.request('/api/v1/auth/rotate-key', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${jwtToken}`,
      },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('rotated');
    expect(body.api_key).toBeDefined();
    expect(body.api_key).not.toBe(apiKey);

    // Old API key should now be rejected or invalidated from cache
    const oldKeyCache = await redis.get(`auth:${apiKey}`);
    expect(oldKeyCache).toBeNull();
  });
});
