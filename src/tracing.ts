import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { ConsoleSpanExporter, SimpleSpanProcessor, BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { Resource } from '@opentelemetry/resources';
import { SEMRESATTRS_SERVICE_NAME } from '@opentelemetry/semantic-conventions';
import * as dotenv from 'dotenv';

dotenv.config();

const isOtelEnabled = process.env.OTEL_ENABLED === 'true';

// Choose exporter architecture depending on environmental variables
const traceExporter = isOtelEnabled
  ? new OTLPTraceExporter({ url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318/v1/traces' })
  : new ConsoleSpanExporter();

const spanProcessor = isOtelEnabled 
  ? new BatchSpanProcessor(traceExporter)
  : new SimpleSpanProcessor(traceExporter);

export const otelSDK = new NodeSDK({
  resource: new Resource({
    [SEMRESATTRS_SERVICE_NAME]: 'nexafx-backend-v2',
  }),
  spanProcessor: spanProcessor,
  instrumentations: [
    getNodeAutoInstrumentations({
      // Fine-tune auto-instrumentation hooks to prevent noise
      '@opentelemetry/instrumentation-fs': { enabled: false },
    }),
  ],
});

// Explicitly register process lifecycles
if (isOtelEnabled || process.env.NODE_ENV === 'development') {
  otelSDK.start();
  console.log(`[OpenTelemetry] Distributed engine started. Mode: ${isOtelEnabled ? 'OTLP HTTP' : 'Console Stream'}`);
}

process.on('SIGTERM', () => {
  otelSDK.shutdown()
    .then(() => console.log('OpenTelemetry SDK cleanly terminated.'))
    .catch((err) => console.error('Error shutting down OpenTelemetry SDK', err))
    .finally(() => process.exit(0));
});