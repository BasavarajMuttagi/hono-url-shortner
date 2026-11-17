import { createMiddleware } from 'hono/factory';
import { trace, SpanStatusCode } from '@opentelemetry/api';

const tracer = trace.getTracer('hono-url-shortner');

/**
 * Pure OpenTelemetry Tracing Middleware for Hono
 * Creates an active span for each HTTP request and enriches it with standard semantic conventions.
 * The exported span is natively ingested by OpenTelemetry-compliant backends like Axiom.
 */
export const otelTracingMiddleware = createMiddleware(async (c, next) => {
  const method = c.req.method;
  const path = c.req.path;
  const spanName = `HTTP ${method} ${path}`;

  return tracer.startActiveSpan(spanName, async (span) => {
    span.setAttribute('http.method', method);
    span.setAttribute('http.url', c.req.url);
    span.setAttribute('http.target', path);

    const userAgent = c.req.header('user-agent');
    if (userAgent) {
      span.setAttribute('http.user_agent', userAgent);
    }

    try {
      await next();

      const statusCode = c.res.status;
      span.setAttribute('http.status_code', statusCode);

      if (statusCode >= 500) {
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: `HTTP ${statusCode}`,
        });
      } else {
        span.setStatus({ code: SpanStatusCode.OK });
      }
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      span.recordException(error);
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error.message || 'Internal Server Error',
      });
      throw err;
    } finally {
      span.end();
    }
  });
});
