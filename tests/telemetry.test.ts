import { describe, it, expect, afterAll } from 'vitest';
import { trace } from '@opentelemetry/api';
import { app } from '../src/app.js';
import { shutdownOtel } from '../src/instrumentation.js';
import { recordSpanEvent, setSpanAttributes, getActiveTraceId } from '../src/telemetry/otel.js';

describe('OpenTelemetry Observability Tests (Pure Standards)', () => {
  afterAll(async () => {
    await shutdownOtel();
  });

  it('should initialize OpenTelemetry tracer and provide active tracer instance', () => {
    const tracer = trace.getTracer('hono-url-shortner');
    expect(tracer).toBeDefined();

    const span = tracer.startSpan('test-span');
    expect(span.spanContext().traceId).toBeDefined();
    expect(span.spanContext().spanId).toBeDefined();
    span.end();
  });

  it('should trace HTTP requests through the OpenTelemetry middleware', async () => {
    const res = await app.request('/health');
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.status).toBe('healthy');
  });

  it('should record standard OpenTelemetry span events and attributes', () => {
    const tracer = trace.getTracer('hono-url-shortner');

    tracer.startActiveSpan('active-test-span', (span) => {
      // Test trace ID retrieval
      const traceId = getActiveTraceId();
      expect(traceId).toBe(span.spanContext().traceId);

      // Test standard attribute setting
      expect(() => {
        setSpanAttributes({
          'custom.metric': 42,
          'custom.status': 'success',
        });
      }).not.toThrow();

      // Test standard span event recording
      expect(() => {
        recordSpanEvent('cache_hit', {
          shortKey: 'demo',
          latency_ms: 0.85,
        });
      }).not.toThrow();

      span.end();
    });
  });
});
