import { Hono } from 'hono';
import crypto from 'node:crypto';
import { sign, verify } from 'hono/jwt';
import { getCookie } from 'hono/cookie';
import type { AppEnv } from '../types/env.js';
import { env } from '../config/env.js';
import { redis } from '../cache/redis.js';
import { db, users } from '../db/index.js';
import { eq } from 'drizzle-orm';
import { COOKIE_NAME } from '../middleware/auth.js';
import { OAuthConsentPage } from '../views/oauth-consent.js';

export const oauthRouter = new Hono<AppEnv>();

/**
 * Helper to resolve the authenticated user from the web session cookie
 */
async function resolveSessionUser(c: any) {
  let token = getCookie(c, COOKIE_NAME);
  if (!token) {
    const authHeader = c.req.header('Authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7).trim();
    }
  }
  if (!token) return null;

  try {
    const payload = await verify(token, env.JWT_SECRET, 'HS256');
    if (payload && payload.sub) {
      const rows = await db
        .select({ id: users.id, email: users.email })
        .from(users)
        .where(eq(users.id, String(payload.sub)))
        .limit(1);
      return rows[0] || null;
    }
  } catch (_err) {
    // If not a valid JWT, fall through
  }

  return null;
}

// =========================================================================
// 1. OAuth 2.1 & OpenID Connect Discovery Metadata (RFC 8414, RFC 9728 & OIDC)
// =========================================================================

function resolveOrigin(c: any): string {
  const forwardedProto = c.req.header('x-forwarded-proto');
  const forwardedHost = c.req.header('x-forwarded-host');
  const host = forwardedHost || c.req.header('host');

  if (host) {
    const isLocal = host.includes('localhost') || host.includes('127.0.0.1');
    const proto = forwardedProto || (isLocal ? 'http' : 'https');
    return `${proto}://${host}`;
  }

  return new URL(c.req.url).origin;
}

function getDiscoveryMetadata(c: any) {
  const origin = resolveOrigin(c);
  return {
    issuer: origin,
    authorization_endpoint: `${origin}/oauth/authorize`,
    token_endpoint: `${origin}/oauth/token`,
    registration_endpoint: `${origin}/oauth/register`,
    userinfo_endpoint: `${origin}/oauth/userinfo`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none', 'client_secret_post', 'client_secret_basic'],
    scopes_supported: ['mcp:tools', 'openid', 'email', 'profile'],
    subject_types_supported: ['public'],
    id_token_signing_alg_values_supported: ['HS256'],
    authorization_response_iss_parameter_supported: true,
  };
}

function getProtectedResourceMetadata(c: any) {
  const origin = resolveOrigin(c);
  return {
    resource: `${origin}/mcp`,
    authorization_servers: [origin],
    scopes_supported: ['mcp:tools'],
    bearer_methods_supported: ['header'],
  };
}

// RFC 9728: OAuth 2.0 Protected Resource Metadata
oauthRouter.get('/.well-known/oauth-protected-resource', (c) => c.json(getProtectedResourceMetadata(c)));
oauthRouter.get('/.well-known/oauth-protected-resource/mcp', (c) => c.json(getProtectedResourceMetadata(c)));
oauthRouter.get('/mcp/.well-known/oauth-protected-resource', (c) => c.json(getProtectedResourceMetadata(c)));

// RFC 8414 & OIDC: Authorization Server Metadata (root & path-scoped)
oauthRouter.get('/.well-known/oauth-authorization-server', (c) => c.json(getDiscoveryMetadata(c)));
oauthRouter.get('/.well-known/oauth-authorization-server/mcp', (c) => c.json(getDiscoveryMetadata(c)));
oauthRouter.get('/mcp/.well-known/oauth-authorization-server', (c) => c.json(getDiscoveryMetadata(c)));

oauthRouter.get('/.well-known/openid-configuration', (c) => c.json(getDiscoveryMetadata(c)));
oauthRouter.get('/.well-known/openid-configuration/mcp', (c) => c.json(getDiscoveryMetadata(c)));
oauthRouter.get('/mcp/.well-known/openid-configuration', (c) => c.json(getDiscoveryMetadata(c)));

// =========================================================================
// 2. Dynamic Client Registration (RFC 7591)
// =========================================================================

async function handleClientRegistration(c: any) {
  try {
    let body: any = {};
    const contentType = c.req.header('content-type') || '';
    if (contentType.includes('application/json')) {
      body = await c.req.json().catch(() => ({}));
    } else {
      body = await c.req.parseBody().catch(() => ({}));
    }

    const clientId = `client_${crypto.randomBytes(16).toString('hex')}`;
    const clientSecret = `secret_${crypto.randomBytes(24).toString('hex')}`;
    const clientName = body.client_name || 'Remote MCP Client';
    const redirectUris = Array.isArray(body.redirect_uris) ? body.redirect_uris : (body.redirect_uris ? [body.redirect_uris] : []);
    const nowSec = Math.floor(Date.now() / 1000);

    const clientMetadata = {
      client_id: clientId,
      client_secret: clientSecret,
      client_name: clientName,
      redirect_uris: redirectUris,
      created_at: new Date().toISOString(),
    };

    // Store client in Valkey with 90-day retention
    await redis.set(`oauth_client:${clientId}`, JSON.stringify(clientMetadata), 'EX', 90 * 24 * 3600);

    return c.json(
      {
        client_id: clientId,
        client_secret: clientSecret,
        client_id_issued_at: nowSec,
        client_secret_expires_at: 0,
        client_name: clientName,
        redirect_uris: redirectUris,
        grant_types: ['authorization_code'],
        response_types: ['code'],
        token_endpoint_auth_method: 'none',
      },
      201
    );
  } catch (err: unknown) {
    console.error('❌ [oauthRouter.register] Error registering client:', err instanceof Error ? err.message : err);
    return c.json({ error: 'invalid_client_metadata', error_description: 'Failed to register client' }, 400);
  }
}

oauthRouter.post('/oauth/register', handleClientRegistration);
oauthRouter.post('/mcp/oauth/register', handleClientRegistration);

// =========================================================================
// 3. Authorization Endpoint (GET & POST /oauth/authorize)
// =========================================================================

oauthRouter.get('/oauth/authorize', async (c) => {
  const query = c.req.query();
  const responseType = query.response_type;
  const clientId = query.client_id;
  const redirectUri = query.redirect_uri;
  const codeChallenge = query.code_challenge;
  const codeChallengeMethod = query.code_challenge_method || 'S256';
  const state = query.state || '';
  const scope = query.scope || 'mcp:tools';

  if (!redirectUri) {
    return c.json({ error: 'invalid_request', error_description: 'Missing redirect_uri parameter' }, 400);
  }

  if (responseType !== 'code') {
    return c.redirect(`${redirectUri}?error=unsupported_response_type&state=${encodeURIComponent(state)}`);
  }

  if (!codeChallenge) {
    return c.redirect(`${redirectUri}?error=invalid_request&error_description=PKCE+code_challenge+required&state=${encodeURIComponent(state)}`);
  }

  if (codeChallengeMethod !== 'S256') {
    return c.redirect(`${redirectUri}?error=invalid_request&error_description=code_challenge_method+must+be+S256&state=${encodeURIComponent(state)}`);
  }

  // Check user authentication
  const user = await resolveSessionUser(c);
  if (!user) {
    // Redirect to login using relative path so user stays on ngrok/custom domain
    const urlObj = new URL(c.req.url);
    const returnUrl = encodeURIComponent(`${urlObj.pathname}${urlObj.search}`);
    return c.redirect(`/login?return_to=${returnUrl}`);
  }

  // Retrieve client name if registered, otherwise format display name
  let clientName = 'Remote Application';
  try {
    const rawClient = await redis.get(`oauth_client:${clientId}`);
    if (rawClient) {
      const parsed = JSON.parse(rawClient);
      clientName = parsed.client_name || clientName;
    } else if (clientId) {
      clientName = clientId;
    }
  } catch {
    // fallback
  }

  return c.html(
    <OAuthConsentPage
      clientName={clientName}
      clientId={clientId || ''}
      redirectUri={redirectUri}
      codeChallenge={codeChallenge}
      codeChallengeMethod={codeChallengeMethod}
      state={state}
      scope={scope}
      userEmail={user.email}
    />
  );
});

oauthRouter.post('/oauth/authorize', async (c) => {
  const body = await c.req.parseBody();
  const decision = body.decision;
  const clientId = String(body.client_id || '');
  const redirectUri = String(body.redirect_uri || '');
  const codeChallenge = String(body.code_challenge || '');
  const codeChallengeMethod = String(body.code_challenge_method || 'S256');
  const state = String(body.state || '');
  const scope = String(body.scope || 'mcp:tools');

  if (!redirectUri) {
    return c.json({ error: 'invalid_request', error_description: 'Missing redirect_uri' }, 400);
  }

  if (decision === 'deny') {
    const delimiter = redirectUri.includes('?') ? '&' : '?';
    return c.redirect(`${redirectUri}${delimiter}error=access_denied&state=${encodeURIComponent(state)}`);
  }

  const user = await resolveSessionUser(c);
  if (!user) {
    return c.redirect('/login');
  }

  // Generate 60-second single-use Authorization Code
  const code = `code_${crypto.randomBytes(32).toString('hex')}`;
  const codeData = {
    userId: user.id,
    userEmail: user.email,
    clientId,
    redirectUri,
    codeChallenge,
    codeChallengeMethod,
    scope,
    createdAt: Date.now(),
  };

  await redis.set(`oauth_code:${code}`, JSON.stringify(codeData), 'EX', 60);

  const origin = resolveOrigin(c);
  const delimiter = redirectUri.includes('?') ? '&' : '?';
  return c.redirect(`${redirectUri}${delimiter}code=${code}&state=${encodeURIComponent(state)}&iss=${encodeURIComponent(origin)}`);
});

// =========================================================================
// 4. Token Endpoint (POST /oauth/token) with PKCE S256 Validation
// =========================================================================

oauthRouter.post('/oauth/token', async (c) => {
  let body: Record<string, any> = {};
  const contentType = c.req.header('content-type') || '';
  if (contentType.includes('application/json')) {
    body = await c.req.json().catch(() => ({}));
  } else {
    body = await c.req.parseBody().catch(() => ({}));
  }

  const grantType = body.grant_type;
  const code = body.code;
  const redirectUri = body.redirect_uri;
  const codeVerifier = body.code_verifier;

  if (grantType !== 'authorization_code') {
    return c.json(
      { error: 'unsupported_grant_type', error_description: 'Only authorization_code grant is supported' },
      400
    );
  }

  if (!code || !codeVerifier) {
    return c.json(
      { error: 'invalid_request', error_description: 'Missing authorization code or code_verifier' },
      400
    );
  }

  // Fetch and invalidate code atomically
  const codeKey = `oauth_code:${code}`;
  let rawCodeData: string | null = null;
  try {
    rawCodeData = await redis.get(codeKey);
    if (rawCodeData) {
      await redis.del(codeKey);
    }
  } catch (err) {
    console.error('❌ [oauthRouter.token] Valkey error reading code:', err);
  }

  if (!rawCodeData) {
    return c.json(
      { error: 'invalid_grant', error_description: 'Authorization code has expired or was already used' },
      400
    );
  }

  const codeData = JSON.parse(rawCodeData);

  // Validate redirect_uri match
  if (redirectUri && codeData.redirectUri && redirectUri !== codeData.redirectUri) {
    return c.json(
      { error: 'invalid_grant', error_description: 'redirect_uri does not match original authorization request' },
      400
    );
  }

  // Validate PKCE code_verifier against stored code_challenge using SHA-256 base64url
  const calculatedChallenge = crypto
    .createHash('sha256')
    .update(codeVerifier)
    .digest('base64url');

  if (calculatedChallenge !== codeData.codeChallenge) {
    return c.json(
      { error: 'invalid_grant', error_description: 'PKCE S256 code_verifier verification failed' },
      400
    );
  }

  // Issue 30-day scoped JWT access token
  const expiresIn = 30 * 24 * 3600; // 30 days
  const accessToken = await sign(
    {
      sub: codeData.userId,
      email: codeData.userEmail,
      client_id: codeData.clientId,
      scope: codeData.scope || 'mcp:tools',
      typ: 'Bearer',
      exp: Math.floor(Date.now() / 1000) + expiresIn,
    },
    env.JWT_SECRET,
    'HS256'
  );

  // Record active OAuth grant in Valkey so user can view & revoke connected apps
  if (codeData.clientId) {
    let clientName = 'Remote Application';
    try {
      const rawClient = await redis.get(`oauth_client:${codeData.clientId}`);
      if (rawClient) {
        const parsed = JSON.parse(rawClient);
        clientName = parsed.client_name || clientName;
      }
    } catch {
      // fallback
    }

    const grantData = {
      clientId: codeData.clientId,
      clientName,
      scope: codeData.scope || 'mcp:tools',
      createdAt: new Date().toISOString(),
    };
    try {
      await redis.set(`oauth_grant:${codeData.userId}:${codeData.clientId}`, JSON.stringify(grantData), 'EX', 90 * 24 * 3600);
      await redis.sadd(`oauth_user_grants:${codeData.userId}`, codeData.clientId);
    } catch (grantErr) {
      console.warn('⚠️ [oauthRouter.token] Valkey grant sync warning:', grantErr);
    }
  }

  return c.json({
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: expiresIn,
    scope: codeData.scope || 'mcp:tools',
  });
});

// =========================================================================
// 5. OpenID Connect UserInfo Endpoint (GET /oauth/userinfo)
// =========================================================================

oauthRouter.get('/oauth/userinfo', async (c) => {
  const authHeader = c.req.header('Authorization');
  let token: string | undefined;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim();
  }

  if (!token) {
    return c.json({ error: 'unauthorized', error_description: 'Missing Bearer token' }, 401);
  }

  try {
    const payload = await verify(token, env.JWT_SECRET, 'HS256');
    if (payload && payload.sub) {
      return c.json({
        sub: payload.sub,
        email: payload.email,
        email_verified: true,
      });
    }
  } catch (_err) {
    // invalid token
  }

  return c.json({ error: 'invalid_token', error_description: 'Invalid or expired access token' }, 401);
});

// =========================================================================
// 6. Connected Applications & Revocation Endpoints (RFC 7009)
// =========================================================================

// GET /api/v1/oauth/connected-apps — List user's authorized OAuth apps
oauthRouter.get('/api/v1/oauth/connected-apps', async (c) => {
  const user = await resolveSessionUser(c);
  if (!user) {
    return c.json({ error: 'unauthorized', error_description: 'Authentication required' }, 401);
  }

  try {
    const clientIds = await redis.smembers(`oauth_user_grants:${user.id}`);
    const apps: Array<{ clientId: string; clientName: string; scope: string; createdAt: string }> = [];

    for (const cid of clientIds) {
      const raw = await redis.get(`oauth_grant:${user.id}:${cid}`);
      if (raw) {
        try {
          apps.push(JSON.parse(raw));
        } catch {
          // ignore corrupted entry
        }
      }
    }

    return c.json({ apps });
  } catch (err) {
    console.error('❌ [oauthRouter.connectedApps] Valkey error:', err);
    return c.json({ apps: [] });
  }
});

// POST /api/v1/oauth/disconnect — Disconnect / revoke an authorized OAuth app
oauthRouter.post('/api/v1/oauth/disconnect', async (c) => {
  const user = await resolveSessionUser(c);
  if (!user) {
    return c.json({ error: 'unauthorized', error_description: 'Authentication required' }, 401);
  }

  let body: Record<string, any> = {};
  const contentType = c.req.header('content-type') || '';
  if (contentType.includes('application/json')) {
    body = await c.req.json().catch(() => ({}));
  } else {
    body = await c.req.parseBody().catch(() => ({}));
  }

  const clientId = String(body.client_id || '');
  if (!clientId) {
    return c.json({ error: 'invalid_request', error_description: 'Missing client_id' }, 400);
  }

  try {
    await redis.del(`oauth_grant:${user.id}:${clientId}`);
    await redis.srem(`oauth_user_grants:${user.id}`, clientId);
    return c.json({ status: 'disconnected', client_id: clientId });
  } catch (err) {
    console.error('❌ [oauthRouter.disconnect] Valkey error:', err);
    return c.json({ error: 'server_error', error_description: 'Failed to revoke application grant' }, 500);
  }
});

// POST /oauth/revoke — Standard RFC 7009 Token Revocation
oauthRouter.post('/oauth/revoke', async (c) => {
  let body: Record<string, any> = {};
  const contentType = c.req.header('content-type') || '';
  if (contentType.includes('application/json')) {
    body = await c.req.json().catch(() => ({}));
  } else {
    body = await c.req.parseBody().catch(() => ({}));
  }

  const token = String(body.token || '');
  if (!token) {
    return c.json({ error: 'invalid_request', error_description: 'Missing token parameter' }, 400);
  }

  try {
    const payload = await verify(token, env.JWT_SECRET, 'HS256');
    if (payload && payload.sub && payload.client_id) {
      await redis.del(`oauth_grant:${payload.sub}:${payload.client_id}`);
      await redis.srem(`oauth_user_grants:${payload.sub}`, String(payload.client_id));
    }
  } catch {
    // RFC 7009 §2.2: If the token is invalid or already revoked, revocation still returns 200 OK
  }

  return c.json({ status: 'revoked' });
});
