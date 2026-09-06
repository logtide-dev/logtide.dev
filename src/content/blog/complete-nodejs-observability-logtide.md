---
title: "Complete Node.js Observability: Logs, Errors, and Traces with LogTide"
description: "Instrument a Node.js service end to end with the LogTide SDK: structured logs, error capture, per-request scopes, breadcrumbs, and complete traces."
pubDate: 2026-06-22
author: "LogTide Team"
tags:
  - "nodejs"
  - "javascript"
  - "observability"
  - "tracing"
keywords:
  - "nodejs structured logging"
  - "nodejs error tracking"
  - "nodejs distributed tracing"
  - "fastify logging"
  - "express logging"
  - "self-hosted nodejs observability"
faqs:
  - question: "What is the LogTide JavaScript SDK?"
    answer: "It is the official @logtide/core package (plus framework adapters like @logtide/fastify and @logtide/express) that sends structured logs, exceptions, and OpenTelemetry-compatible traces to a LogTide instance you host yourself. It provides leveled logging, structured error capture, a Hub/Scope model for per-request isolation, breadcrumbs, distributed tracing with W3C traceparent, and automatic request instrumentation through framework plugins."
  - question: "How do I add LogTide to a Node.js app?"
    answer: "Install @logtide/core and, for web apps, your framework adapter (e.g. npm install @logtide/fastify). Register the plugin with your DSN and service name - the adapter installs the console and global-error integrations, creates a per-request scope, parses and injects traceparent, and starts a span for every request. For non-HTTP code, call hub.init once at startup and use hub.captureLog / hub.captureError."
  - question: "How do I get a complete trace instead of one span per request?"
    answer: "The framework plugin opens one root span per request and exposes the request scope (e.g. request.logtideScope). Wrap meaningful operations - DB queries, upstream API calls, payment steps - in startChildSpan(name, scope) / finishChildSpan(spanId). Children inherit the scope's traceId and nest under the HTTP span, so the whole request shows up as a single connected trace."
  - question: "Can LogTide capture request and response bodies?"
    answer: "Yes, on the Fastify adapter. Set includeRequestBody and includeResponseBody (v0.9.0+) when registering the plugin; the bodies are attached to the request span as http.request_body and http.response_body, truncated to 4096 characters. Capture is raw with no redaction, so enable it only on non-sensitive routes or gate it behind your own logic."
---

One span per request tells you *that* a request was slow. It doesn't tell you *where* the time went, which downstream call failed, or what the payload looked like. Full observability means logs, errors, and traces that are all stitched to the same request - and the **LogTide JavaScript SDK** gives you that without changing how you write Node.

This post walks through instrumenting a Node.js service end to end: structured logs, error capture, per-request context, breadcrumbs, *complete* distributed traces, and request/response body capture - shipped to a LogTide backend you host yourself.

## What you get

The SDK is built around `@logtide/core`, with thin adapters per framework:

- **Leveled logging** - `debug`, `info`, `warn`, `error`, plus structured error capture
- **Hub / Scope model** - per-request isolation for tags, user, extras, and breadcrumbs
- **Distributed tracing** - root spans, child spans, OTLP export, and W3C `traceparent` in and out
- **Framework plugins** - Fastify, Express, Hono, Elysia, Next.js, Nuxt, SvelteKit, Angular: automatic request spans, error capture, and per-request scope with no wiring
- **Console + global-error integrations** - capture `console.*` and uncaught exceptions automatically
- **Reliable transport** - batching, retry with backoff, a circuit breaker, and a bounded buffer so logging never blocks or destabilises your app

## Install

```bash
# Core SDK
npm install @logtide/core

# Plus your framework adapter (includes @logtide/core as a dependency)
npm install @logtide/fastify    # or @logtide/express, @logtide/hono, …
```

## Initialize

For a web app, registering the framework plugin is all the setup you need - it calls `hub.init` for you:

```typescript
import Fastify from 'fastify';
import { logtide } from '@logtide/fastify';

const app = Fastify();

await app.register(logtide, {
  dsn: process.env.LOGTIDE_DSN,
  service: 'api',
  environment: process.env.NODE_ENV ?? 'development',
  release: process.env.GIT_SHA,
  tracesSampleRate: 1.0,
});
```

The plugin already installs `ConsoleIntegration` and `GlobalErrorIntegration` - **don't pass them again** in `integrations`. (Since v0.9.0 a duplicate is ignored anyway, but adding them was previously a common way to double-capture every `console.*` call.)

For non-HTTP code (workers, scripts, queues), initialize the hub once at startup:

```typescript
import { hub, ConsoleIntegration, GlobalErrorIntegration } from '@logtide/core';

hub.init({
  dsn: process.env.LOGTIDE_DSN,
  service: 'worker',
  integrations: [new ConsoleIntegration(), new GlobalErrorIntegration()],
});
```

## Logs and errors

```typescript
import { hub } from '@logtide/core';

hub.captureLog('info', 'User signed up', { userId: '123', plan: 'pro' });
hub.captureLog('warn', 'Rate limit approaching', { current: 90, max: 100 });

try {
  await chargeCard(order);
} catch (error) {
  hub.captureError(error, { orderId: order.id, amount: order.total });
}
```

`captureError` serializes the error with its message, stack frames, and cause chain.

## Per-request context

Framework adapters create an isolated scope per request and hang it off the request object. Tags, user, and extras you set on it are attached to every event captured during that request:

```typescript
app.addHook('preHandler', async (request) => {
  request.logtideScope.setTag('tenant', request.headers['x-tenant-id']);
  request.logtideScope.setExtra('userId', request.user?.id);
});
```

## Breadcrumbs

Breadcrumbs are the trail of events leading up to a log or error. Console output is captured automatically; you can add your own:

```typescript
hub.addBreadcrumb({
  type: 'navigation',
  category: 'checkout',
  message: 'Entered payment step',
  timestamp: Date.now(),
});
```

Since **v0.9.0**, when an event is captured with a scope, it carries *that scope's* breadcrumbs (request-local) rather than the global, process-wide buffer - so a single request's metadata no longer accumulates unrelated history from the rest of the app.

## Complete traces with child spans

This is the part most people miss. The plugin opens **one root span per request**. To see *where the time actually went*, nest the work under that span with child spans. `startChildSpan(name, scope, attributes)` parents a new span on the scope's `traceId` and `spanId`:

```typescript
import { startChildSpan, finishChildSpan } from '@logtide/core';

app.post('/checkout', async (request) => {
  const scope = request.logtideScope;

  // DB transaction as a child span
  const dbSpan = startChildSpan('checkout.db_tx', scope);
  const sale = await db.transaction().execute(/* … */);
  finishChildSpan(dbSpan.spanId, 'ok');

  // Upstream fiscal call as a sibling child span
  const fiscalSpan = startChildSpan('fiscal.create_receipt', scope, { saleId: sale.id });
  try {
    await fiscal.createReceipt(sale);
    finishChildSpan(fiscalSpan.spanId, 'ok');
  } catch (error) {
    finishChildSpan(fiscalSpan.spanId, 'error');
    throw error;
  }

  return { ok: true };
});
```

Both children share the request's `traceId` and nest under the HTTP span - one connected trace instead of disconnected events. For deeper nesting, clone the scope and set `childScope.spanId = span.spanId` before passing it to grandchild spans.

## Background jobs get their own trace

Code that runs outside a request (cron, queue workers) has no request scope, so it would otherwise collapse into one shared trace. Give each run its own:

```typescript
import { hub } from '@logtide/core';

async function processItem(item) {
  const client = hub.getClient();
  const scope = client.createScope();              // fresh traceId per run
  const root = client.startSpan({ name: 'queue.process_item', traceId: scope.traceId });
  scope.spanId = root.spanId;

  try {
    await doWork(item, scope);                      // pass scope for child spans
    client.finishSpan(root.spanId, 'ok');
  } catch (error) {
    client.finishSpan(root.spanId, 'error');
    client.captureError(error, {}, scope);
  }
}
```

## Capturing request and response bodies

On Fastify, opt in to body capture. Bodies are attached to the request span as `http.request_body` and `http.response_body`, truncated to 4096 characters:

```typescript
await app.register(logtide, {
  dsn: process.env.LOGTIDE_DSN,
  service: 'api',
  includeRequestBody: true,    // → span attribute  http.request_body
  includeResponseBody: true,   // → span attribute  http.response_body  (v0.9.0+)
  includeRequestHeaders: true, // sensitive headers are always stripped
});
```

Capture is **raw, with no redaction**, so enable it only on non-sensitive routes or behind your own gating logic.

## Distributed tracing across services

Framework adapters extract incoming `traceparent` headers and inject them into responses automatically. For outgoing calls you make yourself, build the header:

```typescript
import { createTraceparent, generateTraceId, generateSpanId } from '@logtide/core';

const header = createTraceparent(generateTraceId(), generateSpanId(), true);
await fetch('https://api.example.com/data', { headers: { traceparent: header } });
```

## Reliability and graceful shutdown

The transport batches entries, retries with backoff, trips a circuit breaker on repeated failures, and drops from a bounded buffer rather than growing unbounded - logging never blocks your request path. Flush on shutdown so nothing is lost:

```typescript
process.on('SIGTERM', async () => {
  await hub.flush();   // send buffered logs/spans
  await hub.close();   // tear down integrations + transport
  process.exit(0);
});
```

## The 100% checklist

- [x] Register the framework plugin with `dsn` + `service` (don't re-add the default integrations)
- [x] Set per-request context with `request.logtideScope` tags/extras
- [x] Wrap meaningful operations in `startChildSpan` / `finishChildSpan` for complete traces
- [x] Give background jobs their own scope + root span per run
- [x] Opt into `includeRequestBody` / `includeResponseBody` where useful (non-sensitive routes)
- [x] Propagate `traceparent` on outgoing requests
- [x] `flush()` + `close()` on `SIGTERM`

That's the full picture: every log, error, and span tied to the same request, on a backend you own. Point your `LOGTIDE_DSN` at your instance and you're done.
