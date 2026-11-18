import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-proto';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { HostMetrics } from '@opentelemetry/host-metrics';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';
import { ExportResultCode } from '@opentelemetry/core';
import { env } from './config/env.js';

class NoopTraceExporter {
  export(_spans: unknown[], resultCallback: (result: { code: number }) => void): void {
    resultCallback({ code: ExportResultCode.SUCCESS });
  }
  async shutdown(): Promise<void> {
    return Promise.resolve();
  }
}

// Configure OTLP Trace Exporter for Axiom (https://axiom.co/docs/send-data/opentelemetry#opentelemetry-for-node)
const traceExporter =
  env.AXIOM_TOKEN && env.AXIOM_URL && env.AXIOM_DATASET
    ? new OTLPTraceExporter({
        url: `${env.AXIOM_URL.replace(/\/+$/, '')}/v1/traces`,
        headers: {
          Authorization: `Bearer ${env.AXIOM_TOKEN}`,
          'X-Axiom-Dataset': env.AXIOM_DATASET,
        },
      })
    : new NoopTraceExporter();

// Configure OTLP Metric Exporter for Axiom (collects CPU, memory, event loop)
let metricReader: PeriodicExportingMetricReader | undefined;

if (env.AXIOM_TOKEN && env.AXIOM_URL && env.AXIOM_METRICS_DATASET) {
  const metricExporter = new OTLPMetricExporter({
    url: `${env.AXIOM_URL.replace(/\/+$/, '')}/v1/metrics`,
    headers: {
      Authorization: `Bearer ${env.AXIOM_TOKEN}`,
      'X-Axiom-Dataset': env.AXIOM_METRICS_DATASET,
    },
  });

  metricReader = new PeriodicExportingMetricReader({
    exporter: metricExporter,
    exportIntervalMillis: 10000, // Export every 10 seconds
  });
}

export const otelSdk = new NodeSDK({
  resource: resourceFromAttributes({
    [ATTR_SERVICE_NAME]: env.OTEL_SERVICE_NAME || 'hono-url-shortner',
  }),
  traceExporter,
  metricReaders: metricReader ? [metricReader] : [],
  instrumentations: [
    getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-fs': { enabled: false }, // Avoid noisy filesystem spans
    }),
  ],
});

// Start OpenTelemetry SDK
otelSdk.start();

// Initialize host system & process metrics (CPU, RAM, Event Loop)
if (env.AXIOM_TOKEN) {
  const hostMetrics = new HostMetrics();
  hostMetrics.start();
  console.log(
    `📡 OpenTelemetry initialized (exporting traces to "${env.AXIOM_DATASET}", metrics to "${env.AXIOM_METRICS_DATASET}")`
  );
} else {
  console.log('ℹ️ Axiom token not configured. OpenTelemetry running in local mode (remote export skipped).');
}

/**
 * Cleanly shuts down the OpenTelemetry SDK
 */
export async function shutdownOtel(): Promise<void> {
  try {
    await otelSdk.shutdown();
  } catch (err) {
    console.error('Error terminating OpenTelemetry SDK:', err);
  }
}
