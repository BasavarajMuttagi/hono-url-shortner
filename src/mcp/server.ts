import { MCPServer, type RequestContext } from 'mcp-use';
import {
  oauthCustomProvider,
  OAuthError,
  OAuthErrorCode,
  type OAuthAuthInfo,
  type OAuthMetadata,
} from 'mcp-use/oauth';
import { fromJsonSchema } from '@modelcontextprotocol/server';
import { verify } from 'hono/jwt';
import { redis } from '../cache/redis.js';
import { UrlService } from '../services/url.service.js';
import { AnalyticsService } from '../services/analytics.service.js';
import { env } from '../config/env.js';
import type { AppEnv } from '../types/env.js';

export interface AppUser {
  id: string;
  email?: string;
}

function resolveServerOrigin(): string {
  if (process.env.MCP_URL) return process.env.MCP_URL;
  if (env.BASE_URL.startsWith('http://') || env.BASE_URL.startsWith('https://')) {
    return env.BASE_URL;
  }
  return `http://localhost:${env.PORT || 8080}`;
}

const serverOrigin = resolveServerOrigin();
const canonicalResource = new URL('/mcp', serverOrigin);
const issuer = serverOrigin;

const oauthMetadata = {
  issuer,
  authorization_endpoint: `${issuer}/oauth/authorize`,
  token_endpoint: `${issuer}/oauth/token`,
  registration_endpoint: `${issuer}/oauth/register`,
  response_types_supported: ['code'],
  grant_types_supported: ['authorization_code'],
  code_challenge_methods_supported: ['S256'],
  scopes_supported: ['mcp:tools'],
} satisfies OAuthMetadata;

export const mcpServer = new MCPServer<AppUser, AppEnv>({
  name: 'hono-url-shortener',
  version: '1.0.0',
  oauth: oauthCustomProvider<AppUser>({
    resource: canonicalResource,
    requiredScopes: ['mcp:tools'],
    scopesSupported: ['mcp:tools'],
    oauthMetadata,
    createTokenVerifier(resource) {
      return {
        async verifyAccessToken(token: string): Promise<OAuthAuthInfo> {
          try {
            const payload = await verify(token, env.JWT_SECRET, 'HS256');

            if (!payload || !payload.sub || typeof payload.sub !== 'string') {
              throw new OAuthError(OAuthErrorCode.InvalidToken, 'Missing subject claim in token');
            }

            const rawScope = typeof payload.scope === 'string' ? payload.scope : '';
            const scopes = rawScope.split(/\s+/).filter(Boolean);

            if (payload.client_id) {
              try {
                const grant = await redis.get(`oauth_grant:${payload.sub}:${payload.client_id}`);
                if (!grant) {
                  throw new OAuthError(OAuthErrorCode.InvalidToken, 'Access token has been revoked');
                }
              } catch (grantErr) {
                if (grantErr instanceof OAuthError) throw grantErr;
                throw new OAuthError(
                  OAuthErrorCode.InvalidToken,
                  'Authentication verification service temporarily unreachable'
                );
              }
            }

            return {
              token,
              clientId: (payload.client_id as string) || '',
              scopes,
              expiresAt: typeof payload.exp === 'number' ? payload.exp : Math.floor(Date.now() / 1000) + 3600,
              resource,
              extra: { payload },
            };
          } catch (err) {
            if (err instanceof OAuthError) throw err;
            throw new OAuthError(OAuthErrorCode.InvalidToken, 'Invalid or expired Bearer token');
          }
        },
      };
    },
    mapAuthInfo(authInfo: OAuthAuthInfo) {
      const payload = authInfo.extra?.payload as Record<string, unknown>;
      return {
        user: {
          id: String(payload.sub),
          email: typeof payload.email === 'string' ? payload.email : undefined,
        },
        payload,
        permissions: [],
      };
    },
  }),
});

/**
 * Standard MCP wire response helpers.
 */
function textResult(content: string) {
  return {
    content: [{ type: 'text' as const, text: content }],
  };
}

function errorResult(message: string) {
  return {
    isError: true,
    content: [{ type: 'text' as const, text: message }],
  };
}

/**
 * Resolves the public base URL using request headers or falls back to env.BASE_URL.
 */
function resolveBaseUrl(ctx: RequestContext<AppUser, true, AppEnv>): string {
  const host = ctx.request?.header('host');
  if (host) {
    const proto = ctx.request?.header('x-forwarded-proto') || (host.includes('localhost') ? 'http' : 'https');
    return `${proto}://${host}`;
  }
  return env.BASE_URL;
}

/**
 * Type-safe tool registration helper using native RequestContext with authenticated AppUser.
 */
function registerTypedTool<TArgs>(
  name: string,
  description: string,
  schema: Parameters<typeof fromJsonSchema>[0],
  handler: (
    args: TArgs,
    ctx: RequestContext<AppUser, true, AppEnv>
  ) => Promise<ReturnType<typeof textResult> | ReturnType<typeof errorResult>>
) {
  mcpServer.tool(
    {
      name,
      description,
      inputSchema: fromJsonSchema(schema),
    },
    async (args, ctx) => handler(args as TArgs, ctx as unknown as RequestContext<AppUser, true, AppEnv>)
  );
}

// Type definitions for tool input schemas
interface ShortenUrlInput {
  original_url: string;
  title?: string;
}

interface UrlIdentifierInput {
  identifier: string;
}

interface ListUrlsInput {
  page?: number;
  limit?: number;
}

// 1. Tool: shorten_url
registerTypedTool<ShortenUrlInput>(
  'shorten_url',
  'Creates a collision-resistant shortened URL for a long destination link',
  {
    type: 'object',
    properties: {
      original_url: {
        type: 'string',
        pattern: '^https?://',
        description: 'The destination URL to shorten (must start with http:// or https://)',
      },
      title: {
        type: 'string',
        description: 'Optional label or title for the shortened URL',
      },
    },
    required: ['original_url'],
  },
  async ({ original_url, title }, ctx) => {
    const userId = ctx.auth.user.id;

    try {
      const created = await UrlService.create(userId, original_url, title);
      const baseUrl = resolveBaseUrl(ctx);
      const shortUrl = `${baseUrl}/${created.shortKey}`;

      return textResult(
        JSON.stringify(
          {
            message: 'URL shortened successfully',
            id: created.id,
            short_key: created.shortKey,
            short_url: shortUrl,
            original_url: created.originalUrl,
            title: created.title,
            created_at: created.createdAt,
          },
          null,
          2
        )
      );
    } catch (err: unknown) {
      return errorResult(err instanceof Error ? err.message : 'Failed to shorten URL');
    }
  }
);

// 2. Tool: list_my_urls
registerTypedTool<ListUrlsInput>(
  'list_my_urls',
  'Lists recently created shortened URLs owned by the authenticated user',
  {
    type: 'object',
    properties: {
      page: {
        type: 'integer',
        description: 'Page number (default 1)',
        default: 1,
      },
      limit: {
        type: 'integer',
        description: 'Number of records per page (default 10, max 50)',
        default: 10,
      },
    },
  },
  async ({ page, limit }, ctx) => {
    const userId = ctx.auth.user.id;

    try {
      const result = await UrlService.list(userId, page, limit);
      const baseUrl = resolveBaseUrl(ctx);

      const items = result.data.map((r) => ({
        id: r.id,
        short_key: r.shortKey,
        short_url: `${baseUrl}/${r.shortKey}`,
        original_url: r.originalUrl,
        title: r.title,
        created_at: r.createdAt,
      }));

      return textResult(
        JSON.stringify(
          {
            data: items,
            page: result.page,
            limit: result.limit,
            count: items.length,
            total: result.total,
            has_more: result.hasMore,
          },
          null,
          2
        )
      );
    } catch (err: unknown) {
      return errorResult(err instanceof Error ? err.message : 'Failed to list URLs');
    }
  }
);

// 3. Tool: get_url_details
registerTypedTool<UrlIdentifierInput>(
  'get_url_details',
  'Retrieves destination metadata and details for a shortened URL by its short key slug or UUID ID',
  {
    type: 'object',
    properties: {
      identifier: {
        type: 'string',
        description: 'The short slug (e.g. "aB3x9Zq") or URL UUID ID',
      },
    },
    required: ['identifier'],
  },
  async ({ identifier }, ctx) => {
    const userId = ctx.auth.user.id;

    try {
      const record = await UrlService.resolveIdentifier(identifier, userId);

      if (!record) {
        return errorResult(`Short URL "${identifier}" not found or unauthorized for this account`);
      }

      const baseUrl = resolveBaseUrl(ctx);
      return textResult(
        JSON.stringify(
          {
            id: record.id,
            short_key: record.shortKey,
            short_url: `${baseUrl}/${record.shortKey}`,
            original_url: record.originalUrl,
            title: record.title,
            is_active: record.isActive,
            created_at: record.createdAt,
          },
          null,
          2
        )
      );
    } catch (err: unknown) {
      return errorResult(err instanceof Error ? err.message : 'Failed to retrieve URL details');
    }
  }
);

// 4. Tool: get_url_analytics
registerTypedTool<UrlIdentifierInput>(
  'get_url_analytics',
  'Queries ClickHouse OLAP analytics for a short URL (total clicks, unique visitors, top countries, referrers, devices, browsers)',
  {
    type: 'object',
    properties: {
      identifier: {
        type: 'string',
        description: 'The short slug (e.g. "aB3x9Zq") or URL UUID ID',
      },
    },
    required: ['identifier'],
  },
  async ({ identifier }, ctx) => {
    const userId = ctx.auth.user.id;

    try {
      const stats = await AnalyticsService.getMetrics(identifier, userId);
      if (!stats) {
        return errorResult(`URL "${identifier}" not found or unauthorized for this user`);
      }

      return textResult(JSON.stringify(stats, null, 2));
    } catch (err: unknown) {
      return errorResult(err instanceof Error ? err.message : 'Failed to retrieve analytics');
    }
  }
);

// 5. Tool: delete_url
registerTypedTool<UrlIdentifierInput>(
  'delete_url',
  'Deletes a shortened URL, revokes its redirect, and purges it from cache and analytics',
  {
    type: 'object',
    properties: {
      identifier: {
        type: 'string',
        description: 'The short slug (e.g. "aB3x9Zq") or URL UUID ID to delete',
      },
    },
    required: ['identifier'],
  },
  async ({ identifier }, ctx) => {
    const userId = ctx.auth.user.id;

    try {
      const existing = await UrlService.resolveIdentifier(identifier, userId);
      if (!existing) {
        return errorResult(`URL "${identifier}" not found or unauthorized`);
      }

      const deleted = await UrlService.delete(existing.id, userId);
      if (!deleted) {
        return errorResult(`URL "${identifier}" not found or unauthorized`);
      }

      return textResult(
        JSON.stringify(
          {
            message: 'URL deleted successfully',
            id: deleted.id,
            short_key: deleted.shortKey,
          },
          null,
          2
        )
      );
    } catch (err: unknown) {
      return errorResult(err instanceof Error ? err.message : 'Failed to delete URL');
    }
  }
);
