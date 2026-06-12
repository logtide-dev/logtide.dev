---
title: "Azure Functions Logging Integration"
description: "Send Azure Functions logs to LogTide with the JavaScript SDK: structured logging, cold start tracking, and an alternative to Application Insights per-GB costs."
category: "infrastructure"
difficulty: "medium"
sdk: "javascript"
brandIcon: "simple-icons:azurefunctions"
highlights:
  - "SDK-based structured logging"
  - "Cold start tracking"
  - "Cost savings vs App Insights"
  - "Works alongside Azure Monitor"
relatedIntegrations:
  - "aws-lambda"
  - "nodejs"
relatedUseCases:
  - "cost-optimization"
  - "real-time-alerting"
keywords:
  - "azure functions logging"
  - "azure functions logs"
  - "azure functions application insights alternative"
  - "azure functions structured logging"
  - "serverless logging azure"
  - "azure functions log management"
faqs:
  - question: "How do I send Azure Functions logs to LogTide?"
    answer: "Initialize the LogTide JavaScript SDK outside your function handler so it survives warm invocations, log with structured metadata inside the handler, and call flush() before returning so batched logs ship before the worker idles. The same pattern works for HTTP, timer, and queue triggers."
  - question: "Is LogTide cheaper than Application Insights for Azure Functions?"
    answer: "Usually, yes. Application Insights telemetry lands in a Log Analytics workspace billed at roughly $2.76/GB pay-as-you-go. Chatty function apps easily generate tens of GB per month. Self-hosted LogTide replaces the per-GB meter with fixed infrastructure cost, while keeping full-text search, field queries, and alerting."
  - question: "Can I keep Application Insights and use LogTide at the same time?"
    answer: "Yes, and it's the recommended migration path: leave App Insights sampling on for platform metrics and distributed tracing, route verbose application logs to LogTide, and turn down App Insights log retention. You keep the Azure-native APM features while moving the expensive log volume off the meter."
  - question: "Does calling flush() on every invocation slow my function down?"
    answer: "It adds one HTTP round-trip — typically 10-50 ms to an instance in the same region. The SDK batches everything else asynchronously. For latency-critical HTTP functions you can skip the per-invocation flush and rely on the interval flush, accepting a small risk of losing the final batch when an instance is recycled."
---

Azure Functions ship their logs to Application Insights by default — which works, until the Log Analytics bill arrives. At ~$2.76/GB ingested, a chatty function app becomes one of the most expensive log sources in your subscription, and querying it means KQL plus per-GB retention fees.

This guide wires Azure Functions (Node.js v4 programming model) to LogTide for structured, searchable logs with real-time alerting — either replacing verbose App Insights logging or running alongside it.

## Why use LogTide with Azure Functions?

- **Cost control**: Log Analytics charges ~$2.76/GB; LogTide is self-hosted with flat infrastructure costs ([full breakdown](/vs/azure-monitor/))
- **Structured queries**: filter by your own metadata fields instead of writing KQL against `traces`
- **Real-time alerting**: error spikes, timeout patterns, cold start bursts — without Azure Monitor alert rule pricing
- **Cross-cloud correlation**: Functions, on-prem services, and [AWS Lambda](/integrations/aws-lambda/) logs in one place
- **Retention without fees**: keep logs searchable for months instead of paying $0.10/GB/month past the included window

## Prerequisites

- Azure Functions app on the **Node.js v4** programming model (v3 works with minor changes)
- LogTide instance reachable from Azure (public endpoint or VNet)
- A LogTide DSN or API key

## Approach 1: LogTide SDK (recommended)

### Installation

```bash
npm install @logtide/core
```

### HTTP-triggered function

Initialize the hub **outside** the handler — Azure reuses the worker process across invocations, so the client and its batch buffer survive warm starts:

```typescript
// src/functions/processOrder.ts
import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { hub } from '@logtide/core';

hub.init({
  dsn: process.env.LOGTIDE_DSN,
  service: 'order-processor',
  environment: process.env.AZURE_FUNCTIONS_ENVIRONMENT || 'production',
  batchSize: 50,
  flushInterval: 1000, // flush quickly — instances can be recycled anytime
});

let isColdStart = true;

app.http('processOrder', {
  methods: ['POST'],
  authLevel: 'function',
  handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    const startTime = Date.now();

    if (isColdStart) {
      hub.captureLog('info', 'Cold start detected', {
        functionName: context.functionName,
        coldStart: true,
      });
      isColdStart = false;
    }

    hub.captureLog('info', 'Invocation started', {
      invocationId: context.invocationId,
      functionName: context.functionName,
    });

    try {
      const order = await request.json();
      // business logic

      hub.captureLog('info', 'Order processed', {
        invocationId: context.invocationId,
        duration: Date.now() - startTime,
      });

      await hub.flush();
      return { status: 200, jsonBody: { ok: true } };
    } catch (error) {
      hub.captureError(error as Error, {
        extra: { invocationId: context.invocationId },
        tags: { functionName: context.functionName },
      });

      await hub.flush();
      return { status: 500, jsonBody: { error: 'Internal server error' } };
    }
  },
});
```

### Timer and queue triggers

The same pattern applies — initialize once, log with metadata, flush at the end:

```typescript
import { app, InvocationContext, Timer } from '@azure/functions';
import { hub } from '@logtide/core';

app.timer('nightlyCleanup', {
  schedule: '0 0 3 * * *',
  handler: async (timer: Timer, context: InvocationContext) => {
    hub.captureLog('info', 'Cleanup started', { invocationId: context.invocationId });

    const removed = await runCleanup();

    hub.captureLog('info', 'Cleanup finished', {
      invocationId: context.invocationId,
      removedItems: removed,
    });
    await hub.flush();
  },
});
```

### Configuration

Set the connection in your Function App settings (portal → Environment variables, or `local.settings.json` for local dev):

```json
{
  "Values": {
    "LOGTIDE_DSN": "https://lp_your_key@logtide.example.com/your-project"
  }
}
```

If your LogTide instance is private, use VNet integration on the Function App (Premium and Dedicated plans) so outbound traffic reaches it.

## Approach 2: Keep Application Insights, route the volume to LogTide

You don't have to choose. A pragmatic split that most teams land on:

- **App Insights keeps**: platform metrics, distributed traces, dependency maps, live metrics — the APM features Azure does natively well, with **sampling enabled** to cap cost
- **LogTide gets**: all verbose application logging — request details, business events, debug context — the volume that makes Log Analytics expensive

In `host.json`, keep App Insights log capture at `Warning` and above so duplicated volume stays minimal:

```json
{
  "logging": {
    "logLevel": {
      "default": "Warning"
    },
    "applicationInsights": {
      "samplingSettings": {
        "isEnabled": true,
        "maxTelemetryItemsPerSecond": 5
      }
    }
  }
}
```

Your application code logs everything to LogTide via the SDK; App Insights only records warnings, errors and sampled traces. Typical outcome: 80-95% less Log Analytics ingestion with no loss of searchable detail — it's all in LogTide instead.

## Which approach should you pick?

| | SDK only | SDK + App Insights (split) |
|---|---|---|
| Log Analytics costs | Near zero | Heavily reduced (sampled) |
| Distributed tracing | No (logs only) | Yes (App Insights) |
| Azure-native dashboards | No | Yes |
| Best for | Cost-first, log-centric teams | Teams using APM features |

## Troubleshooting

- **Logs missing from the end of invocations** — the instance was recycled before an interval flush; call `await hub.flush()` before returning.
- **Nothing arrives at LogTide** — check outbound networking: Consumption plan functions need a public LogTide endpoint; VNet-only instances require Premium/Dedicated plans with VNet integration.
- **Duplicate logs in both platforms** — lower the `host.json` default log level so App Insights stops capturing what the SDK already ships.

---

**Next steps:**

- [AWS Lambda integration](/integrations/aws-lambda/) — same pattern on AWS
- [LogTide vs Azure Monitor](/vs/azure-monitor/) — full cost and feature comparison
- [Cloud logging pricing breakdown](/cloud-logging-pricing/) — CloudWatch, GCP and Azure compared
- [Real-time alerting use case](/use-cases/real-time-alerting/) — alert rules on function errors
