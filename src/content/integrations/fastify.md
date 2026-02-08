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
import * as Logtide from '@logtide/core';
import { logtidePlugin } from '@logtide/fastify';

Logtide.init({
  dsn: process.env.LOGTIDE_DSN,
  service: 'api-server',
  environment: process.env.NODE_ENV,
});

const fastify = Fastify();
await fastify.register(logtidePlugin);

fastify.get('/users/:id', async (request) => {
  request.logtideScope.setTag('userId', request.params.id);

  Logtide.captureLog('info', 'Fetching user', {
    userId: request.params.id,
  });

  return { id: request.params.id };
});

await fastify.listen({ port: 3000 });
```

## Plugin Options

```typescript
await fastify.register(logtidePlugin, {
  logRequests: true,
  logHeaders: false,
  skip: (request) => request.url === '/health',
  getLogLevel: (request, reply) => {
    if (reply.statusCode >= 500) return 'error';
    if (reply.statusCode >= 400) return 'warn';
    return 'info';
  },
});
```

## Request Scoping

Each request gets an isolated scope:

```typescript
fastify.addHook('onRequest', async (request) => {
  request.logtideScope.setUser({ id: request.user?.id });
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

- [JavaScript SDK](/docs/sdks/nodejs) - Core SDK reference
- [Fastify SDK Reference](/docs/sdks/fastify) - Full API documentation
- [Docker Integration](/integrations/docker) - Container deployments
