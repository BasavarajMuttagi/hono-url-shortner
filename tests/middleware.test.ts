import { describe, it, expect } from 'vitest';
import { app } from '../src/app.js';
import { TEST_API_KEY } from './fixtures.js';

describe('Middleware Pipeline & Developer Ergonomics Tests', () => {
  it('should return health status on GET /health', async () => {
    const res = await app.request('/health');
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.status).toBe('healthy');
    expect(body.uptimeSeconds).toBeGreaterThanOrEqual(0);
    expect(body.timestamp).toBeDefined();
  });

  it('should return live database, valkey, and clickhouse telemetry on GET /metrics', async () => {
    const res = await app.request('/metrics');
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.status).toBe('healthy');
    expect(body.services.postgres.status).toBe('up');
    expect(body.services.valkey.status).toBe('up');
    expect(body.services.clickhouse.status).toBe('up');
    expect(body.services.postgres.latencyMs).toBeGreaterThan(0);
    expect(body.services.valkey.latencyMs).toBeGreaterThan(0);
    expect(body.services.clickhouse.latencyMs).toBeGreaterThan(0);
  });

  it('should attach X-Request-Id and Server-Timing headers', async () => {
    const res = await app.request('/health');
    expect(res.headers.get('X-Request-Id')).toBeDefined();
    expect(res.headers.get('Server-Timing')).toBeDefined();
  });

  it('should serve OpenAPI specification at /docs/openapi.json and Swagger UI at /docs', async () => {
    const specRes = await app.request('/docs/openapi.json');
    expect(specRes.status).toBe(200);
    const spec = await specRes.json();
    expect(spec.openapi).toBe('3.1.0');
    expect(spec.paths['/{shortKey}']).toBeDefined();

    const uiRes = await app.request('/docs');
    expect(uiRes.status).toBe(200);
  });

  it('should reject payloads exceeding 16KB with HTTP 413 Payload Too Large', async () => {
    // Generate 20KB dummy payload
    const largePayload = JSON.stringify({
      original_url: 'https://example.com',
      junk: 'x'.repeat(20 * 1024),
    });

    const res = await app.request('/api/v1/urls', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${TEST_API_KEY}`,
      },
      body: largePayload,
    });

    expect(res.status).toBe(413);
  });
});
