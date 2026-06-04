---
title: "Fastify Logging Integration"
description: "Add structured logging to Fastify applications with plugin-based integration, lifecycle hooks, and trace propagation."
category: "framework"
difficulty: "easy"
sdk: "javascript"
brandIcon: "simple-icons:fastify"
highlights:
  - "Native Fastify plugin"
  - "Lifecycle hook integration"
  - "Request scoping"
  - "Auto error capture"
relatedIntegrations:
  - "nodejs"
  - "docker"
relatedUseCases:
  - "gdpr-compliance"
keywords:
  - "fastify logging"
  - "fastify structured logging"
  - "fastify plugin logging"
  - "fastify request tracing"
  - "fastify log management"
faqs:
  - question: "How do I integrate LogTide with a Fastify application?"
    answer: "Install @logtide/fastify and register the plugin with await fastify.register(logtide, { dsn, service, environment }). The plugin follows Fastify plugin conventions and hooks into the lifecycle automatically — no extra configuration is required to start capturing request logs."
  - question: "Which Fastify lifecycle hooks does LogTide use?"
    answer: "The plugin hooks into onRequest to create a scoped context and extract the traceparent header, onResponse to log the completed request with duration and status code, onError to capture exceptions with full request context, and onClose to flush any pending log events on server shutdown."
  - question: "Does LogTide replace Fastify built-in pino logging?"
    answer: "LogTide operates alongside Fastify's built-in pino logger rather than replacing it. You can keep pino for local development output while LogTide ships structured logs to your self-hosted LogTide instance for centralised search and alerting."
  - question: "How does per-request scoping work in the Fastify plugin?"
    answer: "Each request receives an isolated scope accessible via request.logtideScope. You can call setTag() and setExtra() on it inside routes or hooks, and those values are included only on log events produced during that request — they do not leak into other concurrent requests."
---

LogTide's Fastify SDK provides a native plugin that hooks into Fastify's lifecycle for automatic request logging, per-request scoping, and distributed tracing.

## Why use LogTide with Fastify?

- **Native plugin architecture**: Follows Fastify plugin conventions
- **Lifecycle hooks**: Automatic instrumentation via onRequest, onResponse, onError
- **Per-request scoping**: Isolated context per request through decorators
- **Auto-shutdown**: Flushes logs on server close via onClose hook
- **Zero overhead**: Asynchronous batching keeps Fastify fast

## Prerequisites

- Node.js 18+
- Fastify 4.x or 5.x
- LogTide instance with a DSN

## Installation

```bash
npm install @logtide/fastify
```

## Quick Start

```typescript
import Fastify from 'fastify';
import { hub } from '@logtide/core';
import { logtide } from '@logtide/fastify';

const fastify = Fastify();

// Register the plugin (initializes LogTide automatically)
await fastify.register(logtide, {
  dsn: process.env.LOGTIDE_DSN,
  service: 'api-server',
  environment: process.env.NODE_ENV,
});

fastify.get('/users/:id', async (request) => {
  request.logtideScope.setTag('userId', request.params.id);

  hub.captureLog('info', 'Fetching user', {
    userId: request.params.id,
  });

  return { id: request.params.id };
});

await fastify.listen({ port: 3000 });
```

## Plugin Options

```typescript
await fastify.register(logtide, {
  dsn: process.env.LOGTIDE_DSN,
  service: 'api-server',
  environment: process.env.NODE_ENV,
  release: '1.0.0',
  tracesSampleRate: 1.0,
});
```

## Request Scoping

Each request gets an isolated scope:

```typescript
fastify.addHook('onRequest', async (request) => {
  request.logtideScope.setExtra('userId', request.user?.id);
  request.logtideScope.setTag('tenant', request.headers['x-tenant-id']);
});
```

## Lifecycle Integration

The plugin hooks into Fastify's lifecycle automatically:

| Hook | Behavior |
|------|----------|
| `onRequest` | Creates scope, extracts traceparent, starts span |
| `onResponse` | Logs completion with duration and status |
| `onError` | Captures errors with request context |
| `onClose` | Flushes pending events on shutdown |

## Error Handling

```typescript
fastify.setErrorHandler((error, request, reply) => {
  // Error already captured by LogTide plugin
  reply.status(error.statusCode || 500).send({
    error: error.message,
    traceId: request.logtideTraceId,
  });
});
```

## Next Steps

- [JavaScript SDK](/docs/sdks/nodejs/) - Core SDK reference
- [Fastify SDK Reference](/docs/sdks/fastify/) - Full API documentation
- [Docker Integration](/integrations/docker/) - Container deployments
