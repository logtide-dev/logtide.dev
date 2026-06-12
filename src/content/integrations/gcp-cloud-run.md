---
title: "Google Cloud Run Logging Integration"
description: "Send Google Cloud Run logs to LogTide with the JavaScript SDK or a Fluent Bit sidecar — structured queries and alerting beyond Cloud Logging's free tier."
category: "infrastructure"
difficulty: "medium"
sdk: "javascript"
brandIcon: "simple-icons:googlecloud"
highlights:
  - "SDK-based structured logging"
  - "Fluent Bit sidecar option"
  - "Graceful shutdown flushing"
  - "Cost savings vs Cloud Logging"
relatedIntegrations:
  - "docker"
  - "nodejs"
relatedUseCases:
  - "cost-optimization"
  - "microservices-observability"
keywords:
  - "cloud run logging"
  - "google cloud run logs"
  - "cloud run log management"
  - "cloud logging alternative"
  - "gcp serverless logging"
  - "cloud run structured logging"
faqs:
  - question: "How do I send Google Cloud Run logs to LogTide?"
    answer: "Two patterns: use the LogTide JavaScript SDK inside your service for structured logs with metadata (flushing on SIGTERM), or run a Fluent Bit sidecar container that tails stdout and forwards everything to LogTide's HTTP API with no code changes. The SDK gives richer fields; the sidecar works for any language or existing image."
  - question: "Is Cloud Run logging free?"
    answer: "Cloud Run writes stdout/stderr to Cloud Logging automatically, and the first 50 GiB per project per month is free. Beyond that, ingestion costs $0.50/GiB, plus $0.01/GiB/month for retention past 30 days and BigQuery costs for Log Analytics queries. Busy services cross the free tier quickly."
  - question: "How do I avoid losing logs when Cloud Run scales my container to zero?"
    answer: "Handle SIGTERM: Cloud Run sends it before stopping an instance and allows up to 10 seconds. Flush the LogTide SDK buffer in your SIGTERM handler (and after each request for critical paths), so batched logs ship before the container is terminated."
  - question: "Can I keep Cloud Logging and use LogTide together?"
    answer: "Yes. Cloud Run always writes stdout/stderr to Cloud Logging — you can't fully disable it, but you can set short retention there and treat LogTide as the searchable system of record. That keeps GCP-native debugging available while moving retention and query workloads off the meter."
---

Cloud Run is the easiest way to run containers on GCP, and its logging starts equally easy: anything on stdout lands in Cloud Logging automatically. The catch arrives with scale — after the free 50 GiB/month, you pay $0.50/GiB ingested, retention past 30 days is metered, and structured queries mean BigQuery-backed Log Analytics with its own costs.

This guide ships Cloud Run logs to LogTide for field-based search, real-time alerting, and retention measured in months — with the JavaScript SDK or a zero-code-change Fluent Bit sidecar.

## Why use LogTide with Cloud Run?

- **Cost beyond the free tier**: $0.50/GiB adds up for chatty services; LogTide is flat-cost infrastructure ([full comparison](/vs/gcp-cloud-logging/))
- **Structured metadata queries**: filter by `tenant`, `endpoint` or `revision` directly instead of writing Log Analytics SQL
- **Real-time alerting**: SSE-backed alerts on error patterns without log-based metric + alerting policy plumbing
- **Unified view**: Cloud Run, GKE, on-prem and other clouds in one searchable timeline
- **Retention control**: keep everything searchable without per-GiB retention fees

## Prerequisites

- A Cloud Run service (Node.js for the SDK approach; any language for the sidecar)
- LogTide instance reachable from Cloud Run (public HTTPS or internal via VPC connector)
- LogTide DSN or API key

## Approach 1: LogTide SDK (recommended for Node.js)

### Installation

```bash
npm install @logtide/core
```

### Service setup with graceful shutdown

Cloud Run instances are long-lived between requests but can be stopped anytime (scale-down sends `SIGTERM` with a 10-second grace window). Initialize once at startup, flush on shutdown:

```typescript
// server.ts
import express from 'express';
import { hub } from '@logtide/core';

hub.init({
  dsn: process.env.LOGTIDE_DSN,
  service: process.env.K_SERVICE || 'cloud-run-app',   // injected by Cloud Run
  environment: process.env.NODE_ENV || 'production',
  release: process.env.K_REVISION,                      // revision name, e.g. app-00042-xyz
  batchSize: 50,
  flushInterval: 2000,
});

const app = express();
app.use(express.json());

app.post('/orders', async (req, res) => {
  const startTime = Date.now();

  hub.captureLog('info', 'Order received', {
    orderId: req.body.orderId,
    revision: process.env.K_REVISION,
  });

  try {
    // business logic
    hub.captureLog('info', 'Order processed', {
      orderId: req.body.orderId,
      duration: Date.now() - startTime,
    });
    res.json({ ok: true });
  } catch (error) {
    hub.captureError(error as Error, {
      extra: { orderId: req.body.orderId },
      tags: { endpoint: '/orders' },
    });
    res.status(500).json({ error: 'Internal server error' });
  }
});

const server = app.listen(Number(process.env.PORT) || 8080);

// Cloud Run sends SIGTERM before stopping the instance (10s grace period)
process.on('SIGTERM', async () => {
  await hub.flush();
  server.close(() => process.exit(0));
});
```

The `K_SERVICE` and `K_REVISION` environment variables are injected by Cloud Run automatically — using them as `service` and `release` gives you per-revision filtering in LogTide for free, which makes *"did the new revision introduce these errors?"* a one-click query.

### Deploy with the DSN

```bash
gcloud run deploy my-service \
  --image gcr.io/my-project/my-service \
  --set-secrets LOGTIDE_DSN=logtide-dsn:latest \
  --region europe-west1
```

Store the DSN in Secret Manager rather than a plain environment variable.

## Approach 2: Fluent Bit sidecar (any language, no code changes)

Cloud Run supports multi-container services: run Fluent Bit as a sidecar that tails your app's stdout (via a shared volume) or receives forward-protocol logs, and ships them to LogTide.

The simplest robust pattern is logging to a file on an in-memory shared volume:

```yaml
# service.yaml (Cloud Run multicontainer)
apiVersion: serving.knative.dev/v1
kind: Service
metadata:
  name: my-service
spec:
  template:
    spec:
      containers:
        - name: app
          image: gcr.io/my-project/my-service
          volumeMounts:
            - name: logs
              mountPath: /var/log/app
        - name: fluentbit
          image: cr.fluentbit.io/fluent/fluent-bit:3.0
          volumeMounts:
            - name: logs
              mountPath: /var/log/app
      volumes:
        - name: logs
          emptyDir:
            medium: Memory
            sizeLimit: 64Mi
```

Fluent Bit configuration:

```ini
[INPUT]
    Name tail
    Path /var/log/app/*.log
    Parser json
    Tag cloudrun.app

[OUTPUT]
    Name http
    Match *
    Host logtide.example.com
    Port 443
    URI /api/v1/ingest/single
    Format json_lines
    tls On
    Header X-API-Key ${LOGTIDE_API_KEY}
    Header Content-Type application/json
```

Your app writes JSON lines to `/var/log/app/app.log` (or you keep stdout for Cloud Logging *and* a file for LogTide). No SDK, works for Go, Python, Java, Rust — anything.

## Which approach should you pick?

| | SDK | Fluent Bit sidecar |
|---|---|---|
| Code changes | Yes (logging calls) | None |
| Structured metadata | Native, arbitrary fields | Whatever your JSON logs carry |
| Languages | Node.js (others via [SDKs](/docs/sdks/)) | Any |
| Extra container cost | None | Small sidecar (~50 MB RAM) |
| Best for | New/Node services, rich telemetry | Existing images, polyglot fleets |

## Keeping Cloud Logging in the loop

Cloud Run always writes stdout/stderr to Cloud Logging — that's not disableable, and the first 50 GiB/month is free anyway. The cost-effective split:

1. Log **concise** lines to stdout (request summary, errors) → Cloud Logging, within the free tier, short retention
2. Send **verbose** structured logs to LogTide (full context, business events) → searchable for months
3. Set Cloud Logging retention to the minimum and drop `_Default` sink noise with [exclusion filters](https://cloud.google.com/logging/docs/routing/overview)

You keep GCP-native quick debugging, and the volume that would blow past the free tier lives in LogTide instead.

## Troubleshooting

- **Logs lost on scale-down** — flush in the `SIGTERM` handler; Cloud Run gives you up to 10 seconds.
- **Sidecar can't reach LogTide** — if LogTide is internal, attach a Serverless VPC Access connector to the service and use the internal hostname.
- **Duplicate entries in both platforms** — expected if you log the same lines to stdout and the SDK; split concise vs verbose as above.

---

**Next steps:**

- [LogTide vs GCP Cloud Logging](/vs/gcp-cloud-logging/) — full cost and feature comparison
- [Docker integration](/integrations/docker/) — the same sidecar pattern outside Cloud Run
- [Cloud logging pricing breakdown](/cloud-logging-pricing/) — CloudWatch, GCP and Azure compared
- [Microservices observability](/use-cases/microservices-observability/) — correlating services in one timeline
