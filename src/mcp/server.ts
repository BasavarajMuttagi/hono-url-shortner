import { MCPServer } from 'mcp-use';
import { fromJsonSchema } from '@modelcontextprotocol/server';
import { mcpAuthGuard } from '../middleware/auth.js';
import { UrlService } from '../services/url.service.js';
import { AnalyticsService } from '../services/analytics.service.js';
import { env } from '../config/env.js';
import type { AppEnv } from '../types/env.js';

export const mcpServer = new MCPServer<never, AppEnv>({
  name: 'hono-url-shortener',
  version: '1.0.0',
});

// Protect all MCP protocol operations with strict Bearer token authentication (cookies rejected)
mcpServer.app.use('*', mcpAuthGuard);

/**
 * Standard MCP 2026 wire response helpers (avoids deprecated wrapper functions).
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
function resolveBaseUrl(ctx: { request?: { header: (name: string) => string | undefined } }): string {
  const host = ctx.request?.header('host');
  if (host) {
    const proto = ctx.request?.header('x-forwarded-proto') || (host.includes('localhost') ? 'http' : 'https');
    return `${proto}://${host}`;
  }
  return env.BASE_URL;
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
mcpServer.tool(
  {
    name: 'shorten_url',
    description: 'Creates a collision-resistant shortened URL for a long destination link',
    inputSchema: fromJsonSchema({
      type: 'object',
      properties: {
        original_url: {
          type: 'string',
          description: 'The destination URL to shorten (must start with http:// or https://)',
        },
        title: {
          type: 'string',
          description: 'Optional label or title for the shortened URL',
        },
      },
      required: ['original_url'],
    }),
  },
  async (args, ctx) => {
    const { original_url, title } = args as unknown as ShortenUrlInput;
    const userId = ctx.get('userId') as string | undefined;

    if (!userId) {
      return errorResult('Unauthorized: Missing user authentication context');
    }

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
mcpServer.tool(
  {
    name: 'list_my_urls',
    description: 'Lists recently created shortened URLs owned by the authenticated user',
    inputSchema: fromJsonSchema({
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
    }),
  },
  async (args, ctx) => {
    const { page, limit } = args as ListUrlsInput;
    const userId = ctx.get('userId') as string | undefined;

    if (!userId) {
      return errorResult('Unauthorized: Missing user authentication context');
    }

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
            count: items.length,
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
mcpServer.tool(
  {
    name: 'get_url_details',
    description: 'Retrieves destination metadata and details for a shortened URL by its short key slug or UUID ID',
    inputSchema: fromJsonSchema({
      type: 'object',
      properties: {
        identifier: {
          type: 'string',
          description: 'The short slug (e.g. "aB3x9Zq") or URL UUID ID',
        },
      },
      required: ['identifier'],
    }),
  },
  async (args, ctx) => {
    const { identifier } = args as unknown as UrlIdentifierInput;
    const userId = ctx.get('userId') as string | undefined;

    if (!userId) {
      return errorResult('Unauthorized: Missing user authentication context');
    }

    try {
      // Try resolving by shortKey first, then by UUID
      let record = await UrlService.getByShortKey(identifier, userId);
      if (!record && identifier.length > 20) {
        record = await UrlService.getById(identifier, userId);
      }

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
mcpServer.tool(
  {
    name: 'get_url_analytics',
    description: 'Queries ClickHouse OLAP analytics for a short URL (total clicks, unique visitors, top countries, referrers, devices, browsers)',
    inputSchema: fromJsonSchema({
      type: 'object',
      properties: {
        identifier: {
          type: 'string',
          description: 'The short slug (e.g. "aB3x9Zq") or URL UUID ID',
        },
      },
      required: ['identifier'],
    }),
  },
  async (args, ctx) => {
    const { identifier } = args as unknown as UrlIdentifierInput;
    const userId = ctx.get('userId') as string | undefined;

    if (!userId) {
      return errorResult('Unauthorized: Missing user authentication context');
    }

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
mcpServer.tool(
  {
    name: 'delete_url',
    description: 'Deletes a shortened URL, revokes its redirect, and purges it from cache and analytics',
    inputSchema: fromJsonSchema({
      type: 'object',
      properties: {
        identifier: {
          type: 'string',
          description: 'The short slug (e.g. "aB3x9Zq") or URL UUID ID to delete',
        },
      },
      required: ['identifier'],
    }),
  },
  async (args, ctx) => {
    const { identifier } = args as unknown as UrlIdentifierInput;
    const userId = ctx.get('userId') as string | undefined;

    if (!userId) {
      return errorResult('Unauthorized: Missing user authentication context');
    }

    try {
      // Resolve UUID if identifier was provided as shortKey
      let targetId = identifier;
      if (identifier.length <= 12) {
        const record = await UrlService.getByShortKey(identifier, userId);
        if (!record) {
          return errorResult(`URL with slug "${identifier}" not found or unauthorized`);
        }
        targetId = record.id;
      }

      const deleted = await UrlService.delete(targetId, userId);
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
