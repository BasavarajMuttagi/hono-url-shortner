import { trace, type Attributes } from '@opentelemetry/api';

/**
 * Standard OpenTelemetry helper utilities.
 * All functions operate strictly against the active OpenTelemetry context
 * and require no proprietary third-party SDKs.
 */

/**
 * Adds an event to the currently active OpenTelemetry span.
 * Span events are natively ingested and displayed by OpenTelemetry-compliant
 * backends like Axiom.
 */
export function recordSpanEvent(name: string, attributes?: Attributes): void {
  const activeSpan = trace.getActiveSpan();
  if (activeSpan) {
    activeSpan.addEvent(name, attributes);
  }
}

/**
 * Sets one or more attributes on the currently active OpenTelemetry span.
 */
export function setSpanAttributes(attributes: Attributes): void {
  const activeSpan = trace.getActiveSpan();
  if (activeSpan) {
    activeSpan.setAttributes(attributes);
  }
}

/**
 * Returns the trace ID of the currently active span, or undefined if no span is active.
 */
export function getActiveTraceId(): string | undefined {
  return trace.getActiveSpan()?.spanContext().traceId;
}

/**
 * Returns the span ID of the currently active span, or undefined if no span is active.
 */
export function getActiveSpanId(): string | undefined {
  return trace.getActiveSpan()?.spanContext().spanId;
}
