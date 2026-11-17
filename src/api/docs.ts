import { Hono } from 'hono';
import { swaggerUI } from '@hono/swagger-ui';
import type { AppEnv } from '../types/env.js';

export const docsApp = new Hono<AppEnv>();

const openApiSpec = {
  openapi: '3.1.0',
  info: {
    title: 'High-Throughput Sub-3ms URL Shortener & ClickHouse Analytics API',
    version: '1.0.0',
    description:
      'Ultra-scalable URL shortener with sub-3ms redirection latency powered by Hono, Aiven PostgreSQL with Drizzle ORM, Aiven Valkey with SingleFlight deduplication, and Aiven ClickHouse columnar analytics.',
  },
  servers: [
    {
      url: '/',
      description: 'Current Environment',
    },
  ],
  paths: {
    '/{shortKey}': {
      get: {
        summary: 'Hot-Path Redirection (sub-3ms)',
        description: 'Resolves the short key and instantly redirects visitor via HTTP 302 Found.',
        parameters: [
          {
            name: 'shortKey',
            in: 'path',
            required: true,
            schema: { type: 'string' },
            description: 'The Base62 or custom short key',
          },
        ],
        responses: {
          '302': { description: 'Redirect to original target URL' },
          '404': { description: 'Short key not found or inactive' },
        },
      },
    },
    '/api/v1/auth/register': {
      post: {
        summary: 'Register User',
        description: 'Registers a new user and returns signed JWT in HttpOnly cookie and JSON response.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password'],
                properties: {
                  email: { type: 'string', format: 'email' },
                  password: { type: 'string', minLength: 8 },
                },
              },
            },
          },
        },
        responses: {
          '201': { description: 'User successfully registered' },
          '409': { description: 'Email already exists' },
        },
      },
    },
    '/api/v1/auth/login': {
      post: {
        summary: 'User Login',
        description: 'Authenticates credentials and sets HttpOnly auth_token cookie.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password'],
                properties: {
                  email: { type: 'string', format: 'email' },
                  password: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Login successful' },
          '401': { description: 'Invalid email or password' },
        },
      },
    },
    '/api/v1/auth/me': {
      get: {
        summary: 'Current User Profile',
        description: 'Returns profile of currently authenticated user from HttpOnly cookie or Bearer token.',
        responses: {
          '200': { description: 'User profile details' },
          '401': { description: 'Unauthorized' },
        },
      },
    },
    '/api/v1/urls': {
      post: {
        summary: 'Create Shortened URL',
        description: 'Shortens a destination URL, supporting Base62 random keys and custom aliases.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['original_url'],
                properties: {
                  original_url: { type: 'string', format: 'uri' },
                  title: { type: 'string' },
                  custom_key: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          '201': { description: 'Shortened URL created' },
          '400': { description: 'Validation error' },
          '409': { description: 'Custom key already in use' },
          '429': { description: 'Rate limit exceeded' },
        },
      },
      get: {
        summary: 'List User URLs',
        description: 'Returns paginated list of short URLs belonging to the authenticated user.',
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
        ],
        responses: {
          '200': { description: 'Paginated list of URLs' },
        },
      },
    },
    '/api/v1/urls/{id}': {
      get: {
        summary: 'Get URL Metadata',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'URL metadata' },
          '404': { description: 'URL not found' },
        },
      },
      delete: {
        summary: 'Delete Short URL',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'URL deactivated and purged from cache' },
          '404': { description: 'URL not found' },
        },
      },
    },
    '/api/v1/urls/{id}/analytics': {
      get: {
        summary: 'Get ClickHouse Columnar Analytics',
        description: 'Aggregates click counts, unique visitors, daily timeseries, top referrers, and device breakdown with ETag caching.',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'Linktree-style analytics dataset' },
          '304': { description: 'Not Modified (ETag match)' },
          '404': { description: 'URL not found' },
        },
      },
    },
    '/health': {
      get: {
        summary: 'Health Check',
        responses: {
          '200': { description: 'Service is healthy' },
        },
      },
    },
    '/metrics': {
      get: {
        summary: 'System & Service Metrics',
        description: 'Returns live connectivity and latency metrics for PostgreSQL, Valkey, and ClickHouse.',
        responses: {
          '200': { description: 'Metrics report' },
        },
      },
    },
  },
};

docsApp.get('/docs/openapi.json', (c) => c.json(openApiSpec));
docsApp.get('/docs', swaggerUI({ url: '/docs/openapi.json' }));
