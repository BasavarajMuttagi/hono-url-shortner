import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import crypto from 'node:crypto';
import { app } from '../src/app.js';
import { db, closeDb, users } from '../src/db/index.js';
import { closeRedis, redis } from '../src/cache/redis.js';
import { eq } from 'drizzle-orm';

describe('OAuth 2.1 + PKCE + Discovery + Consent Integration Tests', () => {
  const testEmail = `oauth_user_${crypto.randomBytes(4).toString('hex')}@shortener.local`;
  const testPassword = 'Password123!';
  let jwtToken = '';
  let registeredClientId = '';
  const redirectUri = 'https://chatgpt.com/api/v1/apps/callback';

  // Generate PKCE code_verifier and code_challenge (S256)
  const codeVerifier = crypto.randomBytes(32).toString('base64url');
  const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');

  beforeAll(async () => {
    // 1. Register test user to obtain session token
    const res = await app.request('/api/v1/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testEmail, password: testPassword }),
    });

    const body = await res.json();
    jwtToken = body.token;
  });

  afterAll(async () => {
    await db.delete(users).where(eq(users.email, testEmail));
    await closeDb();
    await closeRedis();
  });

  it('should serve RFC 9728 OAuth 2.0 Protected Resource Metadata for /mcp', async () => {
    const resRoot = await app.request('/.well-known/oauth-protected-resource');
    expect(resRoot.status).toBe(200);
    const bodyRoot = await resRoot.json();
    expect(bodyRoot.resource).toContain('/mcp');
    expect(bodyRoot.authorization_servers).toBeDefined();

    const resMcp = await app.request('/mcp/.well-known/oauth-protected-resource');
    expect(resMcp.status).toBe(200);

    const resAuthServerMcp = await app.request('/mcp/.well-known/oauth-authorization-server');
    expect(resAuthServerMcp.status).toBe(200);
  });

  it('should include WWW-Authenticate with resource_metadata on unauthenticated /mcp 401', async () => {
    const res = await app.request('/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    });

    expect(res.status).toBe(401);
    const wwwAuth = res.headers.get('www-authenticate') || '';
    expect(wwwAuth).toContain('Bearer');
    expect(wwwAuth).toContain('resource_metadata');
  });

  it('should serve RFC 8414 OAuth 2.1 authorization server discovery metadata', async () => {
    const res = await app.request('/.well-known/oauth-authorization-server');
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.authorization_endpoint).toContain('/oauth/authorize');
    expect(body.token_endpoint).toContain('/oauth/token');
    expect(body.registration_endpoint).toContain('/oauth/register');
    expect(body.code_challenge_methods_supported).toContain('S256');
    expect(body.grant_types_supported).toContain('authorization_code');
  });

  it('should serve OpenID Connect discovery metadata', async () => {
    const res = await app.request('/.well-known/openid-configuration');
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.userinfo_endpoint).toContain('/oauth/userinfo');
    expect(body.scopes_supported).toContain('mcp:tools');
  });

  it('should support Dynamic Client Registration (RFC 7591)', async () => {
    const res = await app.request('/oauth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_name: 'ChatGPT MCP Connector',
        redirect_uris: [redirectUri],
      }),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.client_id).toBeDefined();
    expect(body.client_name).toBe('ChatGPT MCP Connector');
    expect(body.redirect_uris).toContain(redirectUri);

    registeredClientId = body.client_id;
  });

  it('should redirect unauthenticated users from /oauth/authorize to /login', async () => {
    const authUrl = `/oauth/authorize?response_type=code&client_id=${registeredClientId}&redirect_uri=${encodeURIComponent(redirectUri)}&code_challenge=${codeChallenge}&code_challenge_method=S256&state=state123`;
    const res = await app.request(authUrl);

    expect(res.status).toBe(302);
    const location = res.headers.get('location') || '';
    expect(location).toContain('/login?return_to=');
  });

  it('should render the OAuth Consent Screen for logged-in users', async () => {
    const authUrl = `/oauth/authorize?response_type=code&client_id=${registeredClientId}&redirect_uri=${encodeURIComponent(redirectUri)}&code_challenge=${codeChallenge}&code_challenge_method=S256&state=state123`;
    const res = await app.request(authUrl, {
      headers: {
        Cookie: `auth_token=${jwtToken}`,
      },
    });

    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('Authorize Connection');
    expect(html).toContain('Requested Permissions');
    expect(html).toContain(testEmail);
    expect(html).toContain('Authorize');
    expect(html).toContain('Deny');
  });

  it('should redirect with access_denied error when user denies consent', async () => {
    const formData = new URLSearchParams({
      decision: 'deny',
      client_id: registeredClientId,
      redirect_uri: redirectUri,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      state: 'state_denied',
    });

    const res = await app.request('/oauth/authorize', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Cookie: `auth_token=${jwtToken}`,
      },
      body: formData.toString(),
    });

    expect(res.status).toBe(302);
    const location = res.headers.get('location') || '';
    expect(location).toContain('error=access_denied');
    expect(location).toContain('state=state_denied');
  });

  let authCode = '';

  it('should issue a single-use authorization code when user grants consent', async () => {
    const formData = new URLSearchParams({
      decision: 'authorize',
      client_id: registeredClientId,
      redirect_uri: redirectUri,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      state: 'xyz987',
      scope: 'mcp:tools',
    });

    const res = await app.request('/oauth/authorize', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Cookie: `auth_token=${jwtToken}`,
      },
      body: formData.toString(),
    });

    expect(res.status).toBe(302);
    const location = res.headers.get('location') || '';
    expect(location).toContain('state=xyz987');
    expect(location).toContain('code=');

    // Extract authorization code
    const redirectParams = new URL(location).searchParams;
    authCode = redirectParams.get('code') || '';
    expect(authCode).toMatch(/^code_[a-f0-9]{64}$/);
  });

  it('should reject token exchange with an invalid PKCE code_verifier', async () => {
    const res = await app.request('/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code: authCode,
        redirect_uri: redirectUri,
        code_verifier: 'invalid_verifier_that_does_not_match_hash',
      }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('invalid_grant');
    expect(body.error_description).toContain('PKCE');
  });

  let oauthAccessToken = '';

  it('should exchange authorization code and valid PKCE code_verifier for access token', async () => {
    // Generate a new code for the successful exchange (since the previous code was consumed/tested)
    const formData = new URLSearchParams({
      decision: 'authorize',
      client_id: registeredClientId,
      redirect_uri: redirectUri,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      state: 'state_success',
      scope: 'mcp:tools',
    });

    const authRes = await app.request('/oauth/authorize', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Cookie: `auth_token=${jwtToken}`,
      },
      body: formData.toString(),
    });

    const location = authRes.headers.get('location') || '';
    const freshCode = new URL(location).searchParams.get('code') || '';

    // Exchange with matching code_verifier
    const tokenRes = await app.request('/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code: freshCode,
        redirect_uri: redirectUri,
        code_verifier: codeVerifier,
      }),
    });

    expect(tokenRes.status).toBe(200);
    const tokenBody = await tokenRes.json();
    expect(tokenBody.access_token).toBeDefined();
    expect(tokenBody.token_type).toBe('Bearer');
    expect(tokenBody.expires_in).toBeGreaterThan(0);
    expect(tokenBody.scope).toBe('mcp:tools');

    oauthAccessToken = tokenBody.access_token;
  });

  it('should retrieve authenticated userinfo via GET /oauth/userinfo with OAuth access token', async () => {
    const res = await app.request('/oauth/userinfo', {
      headers: {
        Authorization: `Bearer ${oauthAccessToken}`,
      },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.email).toBe(testEmail);
    expect(body.email_verified).toBe(true);
  });

  it('should allow the OAuth access token to authenticate and call MCP tools on /mcp', async () => {
    const res = await app.request('/mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
        Authorization: `Bearer ${oauthAccessToken}`,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 99,
        method: 'tools/call',
        params: {
          name: 'shorten_url',
          arguments: {
            original_url: 'https://openai.com/index/introducing-operator/',
            title: 'OAuth 2.1 Authenticated Link',
          },
        },
      }),
    });

    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain('URL shortened successfully');
    expect(text).toContain('short_key');
  });

  it('should list connected applications via GET /api/v1/oauth/connected-apps', async () => {
    const res = await app.request('/api/v1/oauth/connected-apps', {
      headers: {
        Authorization: `Bearer ${jwtToken}`,
      },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.apps)).toBe(true);
    expect(body.apps.length).toBeGreaterThanOrEqual(1);
    expect(body.apps[0].clientId).toBe(registeredClientId);
  });

  it('should disconnect application via POST /api/v1/oauth/disconnect and reject subsequent /mcp calls', async () => {
    // 1. Disconnect the app
    const resDisconnect = await app.request('/api/v1/oauth/disconnect', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${jwtToken}`,
      },
      body: JSON.stringify({ client_id: registeredClientId }),
    });

    expect(resDisconnect.status).toBe(200);
    const discBody = await resDisconnect.json();
    expect(discBody.status).toBe('disconnected');

    // 2. Subsequent call to /mcp with that token should receive 401 Unauthorized (revoked)
    const resMcp = await app.request('/mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${oauthAccessToken}`,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 100,
        method: 'tools/call',
        params: {
          name: 'shorten_url',
          arguments: { original_url: 'https://example.com' },
        },
      }),
    });

    expect(resMcp.status).toBe(401);
    const mcpBody = await resMcp.json();
    expect(mcpBody.error).toBe('invalid_token');
    expect(mcpBody.error_description).toContain('revoked');
  });
});
